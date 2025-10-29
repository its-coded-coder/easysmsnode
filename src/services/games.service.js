const fs = require('fs').promises;
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const thumbnailService = require('./thumbnail.service');

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL;

class GamesService {
  constructor() {
    this.gamesDirectory = process.env.GAMES_DIRECTORY || './games';
    this.isScanning = false;
    this.defaultUserId = null;
  }

  async initialize() {
    try {
      const firstUser = await prisma.auth_user.findFirst();
      if (firstUser) {
        this.defaultUserId = firstUser.id;
      } else {
        logger.warn('No users found in database. Games will need a valid user ID.');
      }
    } catch (error) {
      logger.error('Failed to initialize games service:', error.message);
    }
  }

  async scanGames() {
    if (this.isScanning) {
      logger.info('Game scan already in progress');
      return;
    }

    if (!this.defaultUserId) {
      logger.error('Cannot scan games: No default user ID available');
      return;
    }

    this.isScanning = true;
    logger.info('Starting game directory scan...');

    try {
      const entries = await fs.readdir(this.gamesDirectory, { withFileTypes: true });
      const gameFolders = entries.filter(entry => entry.isDirectory());

      for (const folder of gameFolders) {
        await this.processGameFolder(folder.name);
      }

      logger.success(`Game scan completed. Processed ${gameFolders.length} folders`);
    } catch (error) {
      logger.error('Game scan error:', error.message);
    } finally {
      this.isScanning = false;
    }
  }

  async processGameFolder(folderName) {
    try {
      const folderPath = path.join(this.gamesDirectory, folderName);
      const indexPath = path.join(folderPath, 'index.html');

      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      if (!indexExists) {
        logger.warn(`No index.html in ${folderName}, skipping`);
        return;
      }

      const slug = this.generateSlug(folderName);

      const existingGame = await prisma.game.findUnique({ where: { slug } });

      if (existingGame) {
        logger.info(`Game ${slug} already exists, skipping`);
        return;
      }

      const title = this.extractGameName(folderName);
      const htmlContent = await fs.readFile(indexPath, 'utf-8');
      const description = await this.extractDescription(htmlContent);
      const category = await this.categorizeGame(title, description, htmlContent);

      const game = await prisma.game.create({
        data: {
          title,
          slug,
          description,
          category,
          entry_file: 'index.html',
          status: 'published',
          created_at: new Date(),
          updated_at: new Date(),
          is_featured: false,
          play_count: 0,
          minio_bucket: 'games',
          game_file: folderName,
          created_by_id: this.defaultUserId
        }
      });

      logger.success(`Created game: ${title} (${slug}) - Category: ${category}`);

      thumbnailService.generateThumbnail(game.id, folderPath);
    } catch (error) {
      logger.error(`Error processing ${folderName}:`, error.message);
    }
  }

  generateSlug(folderName) {
    return folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  extractGameName(folderName) {
    return folderName
      .replace(/^\d+-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  async extractDescription(htmlContent) {
    const metaDescMatch = htmlContent.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (metaDescMatch) return metaDescMatch[1];

    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1];

    return 'An exciting game to play!';
  }

  async categorizeWithOpenAI(title, description, htmlContent) {
    try {
      const prompt = `Categorize the game: ${title}. ${description ? `Description: ${description}.` : ''} Categories: Puzzle, Action, Arcade, Strategy, Sports, Adventure, Casual, Racing, Shooter, RPG, Simulation, Card, Board, Music, Educational, Platformer, Fighting, Trivia. Return only the category.`;

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-mini',
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const category = data.choices[0]?.message?.content?.trim();

      if (category) {
        logger.info(`OpenAI categorized ${title} as: ${category}`);
        return category;
      } else {
        throw new Error('No category returned from OpenAI');
      }
    } catch (error) {
      logger.error('OpenAI categorization error:', error.message);
      throw error;
    }
  }

  async categorizeGame(title, description, htmlContent) {
    try {
      const prompt = `Analyze this game and categorize it into ONE of these categories: Puzzle, Action, Arcade, Strategy, Sports, Adventure, Casual, Racing, Shooter, RPG, Simulation, Card, Board, Music, Educational, Platformer, Fighting, Trivia.

Game Name: ${title}
Description: ${description || 'N/A'}
HTML Summary: ${htmlContent.substring(0, 1000)}

Return ONLY the category name, nothing else.`;

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const category = data.candidates[0]?.content?.parts[0]?.text?.trim();

      if (!category) {
        throw new Error('No category returned from Gemini');
      }

      logger.info(`Gemini categorized ${title} as: ${category}`);
      return category;
    } catch (geminiError) {
      logger.warn(`Gemini categorization failed for ${title}: ${geminiError.message}`);
      logger.info('Falling back to OpenAI...');

      try {
        return await this.categorizeWithOpenAI(title, description, htmlContent);
      } catch (openaiError) {
        logger.error('OpenAI fallback also failed:', openaiError.message);
        logger.warn(`Defaulting to 'Casual' category for ${title}`);
        return 'Casual';
      }
    }
  }

  async getAllGames() {
    return await prisma.game.findMany({
      where: { status: 'published' },
      orderBy: { created_at: 'desc' },
      include: {
        auth_user: {
          select: {
            username: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });
  }

  async getGameBySlug(slug) {
    const game = await prisma.game.findUnique({
      where: { slug },
      include: {
        auth_user: {
          select: {
            username: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    if (game) {
      await prisma.game.update({
        where: { id: game.id },
        data: { play_count: { increment: 1 } }
      });
    }

    return game;
  }

  async updateGameThumbnail(gameId, thumbnailPath) {
    return await prisma.game.update({
      where: { id: gameId },
      data: {
        thumbnail: thumbnailPath,
        updated_at: new Date()
      }
    });
  }

  async startAutoScan() {
    await this.initialize();
    await this.scanGames();
    setInterval(() => this.scanGames(), 60 * 60 * 1000);
  }

  async deleteGame(gameId) {
    try {
      const game = await prisma.game.findUnique({ where: { id: gameId } });
      if (!game) {
        throw new Error('Game not found');
      }

      await prisma.$transaction([
        prisma.gameSession.deleteMany({ where: { game_id: gameId } }),
        prisma.gameFavorite.deleteMany({ where: { game_id: gameId } }),
        prisma.game.delete({ where: { id: gameId } })
      ]);

      logger.success(`Deleted game: ${game.title} (ID: ${gameId})`);
      return { success: true, game };
    } catch (error) {
      logger.error('Delete game error:', error.message);
      throw error;
    }
  }
}

module.exports = new GamesService();