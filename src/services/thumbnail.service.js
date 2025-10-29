const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class ThumbnailService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.browser = null;
  }
  
  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      logger.success('Thumbnail service initialized');
    } catch (error) {
      logger.error('Failed to initialize puppeteer:', error.message);
    }
  }
  
  async generateThumbnail(gameId, folderPath) {
    this.queue.push({ gameId, folderPath });
    this.processQueue();
  }
  
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const { gameId, folderPath } = this.queue.shift();
      await this.captureThumbnail(gameId, folderPath);
    }
    this.isProcessing = false;
  }
  
  async captureThumbnail(gameId, folderPath) {
    let page = null;
    try {
      if (!this.browser) {
        await this.initialize();
      }

      const indexPath = path.join(folderPath, 'index.html');
      const thumbnailPath = path.join(folderPath, 'thumbnail.png');
      const relativePath = path.relative(process.cwd(), thumbnailPath);

      page = await this.browser.newPage();
      await page.setViewport({ width: 800, height: 600 });
      
      await page.goto(`file://${path.resolve(indexPath)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      await page.screenshot({
        path: thumbnailPath,
        type: 'png'
      });

      const db = require('../services/database');
      await db.updateGameThumbnail(gameId, relativePath);

      logger.success(`Thumbnail generated for game ${gameId}`);
    } catch (error) {
      logger.error(`Thumbnail generation failed for game ${gameId}:`, error.message);
    } finally {
      if (page) await page.close();
    }
  }
  
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new ThumbnailService();
