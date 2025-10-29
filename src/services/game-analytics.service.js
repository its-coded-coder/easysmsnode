const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class GameAnalyticsService {
  async startSession(msisdn, gameId) {
    try {
      const activeSessions = await prisma.gameSession.findMany({
        where: {
          msisdn,
          game_id: gameId,
          is_active: true
        }
      });

      const now = new Date();
      for (const session of activeSessions) {
        const durationSeconds = Math.floor((now - session.started_at) / 1000);
        await prisma.gameSession.update({
          where: { id: session.id },
          data: {
            is_active: false,
            last_activity: now,
            duration_seconds: durationSeconds
          }
        });
      }

      const sessionId = crypto.randomBytes(16).toString('hex');
      const session = await prisma.gameSession.create({
        data: {
          msisdn,
          game_id: gameId,
          session_id: sessionId,
          started_at: now,
          last_activity: now,
          duration_seconds: 0,
          is_active: true
        }
      });

      logger.info(`Session started: ${session.id} for ${msisdn} on game ${gameId}`);
      return session;
    } catch (error) {
      logger.error('Start session error:', error.message);
      throw error;
    }
  }

  async endSession(sessionId) {
    try {
      const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
      if (!session) {
        throw new Error('Session not found');
      }

      const now = new Date();
      const durationSeconds = Math.floor((now - session.started_at) / 1000);

      const updatedSession = await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          last_activity: now,
          duration_seconds: durationSeconds,
          is_active: false
        }
      });

      logger.info(`Session ended: ${sessionId}, duration: ${durationSeconds}s`);
      return updatedSession;
    } catch (error) {
      logger.error('End session error:', error.message);
      throw error;
    }
  }

  async updateSession(sessionId) {
    try {
      const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
      if (!session) return null;

      const now = new Date();
      const durationSeconds = Math.floor((now - session.started_at) / 1000);

      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          last_activity: now,
          duration_seconds: durationSeconds
        }
      });

      return { sessionId, duration_seconds: durationSeconds };
    } catch (error) {
      logger.error('Update session error:', error.message);
      return null;
    }
  }

  async getUserMetrics(msisdn) {
    try {
      const sessions = await prisma.gameSession.findMany({
        where: { msisdn },
        include: { game: true },
        orderBy: { started_at: 'desc' }
      });

      const totalPlayTime = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
      const gamesPlayed = new Set(sessions.map(s => s.game_id)).size;
      const totalSessions = sessions.length;

      const gameStats = await prisma.gameSession.groupBy({
        by: ['game_id'],
        where: { msisdn },
        _sum: { duration_seconds: true },
        _count: { id: true }
      });

      const gamesWithDetails = await Promise.all(
        gameStats.map(async (stat) => {
          const game = await prisma.game.findUnique({ where: { id: stat.game_id } });
          return {
            game: game?.title || 'Unknown',
            totalPlayTime: stat._sum.duration_seconds || 0,
            sessions: stat._count.id
          };
        })
      );

      return {
        msisdn,
        totalPlayTime,
        gamesPlayed,
        totalSessions,
        recentSessions: sessions.slice(0, 10),
        gameStats: gamesWithDetails
      };
    } catch (error) {
      logger.error('Get user metrics error:', error.message);
      throw error;
    }
  }

  async getGameMetrics(gameId) {
    try {
      const sessions = await prisma.gameSession.findMany({
        where: { game_id: gameId }
      });

      const totalPlayTime = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
      const uniquePlayers = new Set(sessions.map(s => s.msisdn)).size;
      const totalSessions = sessions.length;
      const avgPlayTime = totalSessions > 0 ? Math.floor(totalPlayTime / totalSessions) : 0;

      return {
        gameId,
        totalPlayTime,
        uniquePlayers,
        totalSessions,
        avgPlayTime
      };
    } catch (error) {
      logger.error('Get game metrics error:', error.message);
      throw error;
    }
  }

  async addFavorite(msisdn, gameId) {
    try {
      const favorite = await prisma.gameFavorite.create({
        data: {
          msisdn,
          game_id: gameId,
          created_at: new Date()
        },
        include: {
          game: true
        }
      });

      logger.info(`Added favorite: ${msisdn} -> game ${gameId}`);
      return favorite;
    } catch (error) {
      if (error.code === 'P2002') {
        logger.warn(`Favorite already exists: ${msisdn} -> game ${gameId}`);
        throw new Error('Game already in favorites');
      }
      logger.error('Add favorite error:', error.message);
      throw error;
    }
  }

  async removeFavorite(msisdn, gameId) {
    try {
      await prisma.gameFavorite.deleteMany({
        where: {
          msisdn,
          game_id: gameId
        }
      });

      logger.info(`Removed favorite: ${msisdn} -> game ${gameId}`);
      return { success: true };
    } catch (error) {
      logger.error('Remove favorite error:', error.message);
      throw error;
    }
  }

  async getUserFavorites(msisdn) {
    try {
      const favorites = await prisma.gameFavorite.findMany({
        where: { msisdn },
        include: {
          game: true
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return favorites.map(f => f.game);
    } catch (error) {
      logger.error('Get user favorites error:', error.message);
      throw error;
    }
  }

  async isFavorite(msisdn, gameId) {
    try {
      const favorite = await prisma.gameFavorite.findFirst({
        where: {
          msisdn,
          game_id: gameId
        }
      });

      return !!favorite;
    } catch (error) {
      logger.error('Check favorite error:', error.message);
      return false;
    }
  }

  async getPlayHistory(msisdn, limit = 10) {
    try {
      const sessions = await prisma.gameSession.findMany({
        where: { msisdn },
        include: { game: true },
        orderBy: { started_at: 'desc' },
        take: limit
      });

      const uniqueGames = [];
      const seenGameIds = new Set();

      for (const session of sessions) {
        if (!seenGameIds.has(session.game_id)) {
          seenGameIds.add(session.game_id);
          uniqueGames.push({
            ...session.game,
            lastPlayed: session.started_at,
            duration: session.duration_seconds
          });
        }
      }

      return uniqueGames;
    } catch (error) {
      logger.error('Get play history error:', error.message);
      throw error;
    }
  }
}

module.exports = new GameAnalyticsService();