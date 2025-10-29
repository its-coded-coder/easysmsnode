const gamesService = require('../services/games.service');
const gameAnalyticsService = require('../services/game-analytics.service');
const logger = require('../utils/logger');

class GamesController {
  async getAllGames(req, res) {
    try {
      const games = await gamesService.getAllGames();
      res.json({
        success: true,
        games
      });
    } catch (error) {
      logger.error('Get all games error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getGameBySlug(req, res) {
    try {
      const { slug } = req.params;
      const game = await gamesService.getGameBySlug(slug);
      
      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      const isFavorite = await gameAnalyticsService.isFavorite(req.msisdn, game.id);

      res.json({
        success: true,
        game: {
          ...game,
          isFavorite
        }
      });
    } catch (error) {
      logger.error('Get game by slug error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async startSession(req, res) {
    try {
      const { gameId } = req.body;
      const msisdn = req.msisdn;

      if (!gameId) {
        return res.status(400).json({
          success: false,
          error: 'Game ID is required'
        });
      }

      const session = await gameAnalyticsService.startSession(msisdn, parseInt(gameId));

      res.json({
        success: true,
        session
      });
    } catch (error) {
      logger.error('Start session error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async endSession(req, res) {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      const session = await gameAnalyticsService.endSession(parseInt(sessionId));

      res.json({
        success: true,
        session
      });
    } catch (error) {
      logger.error('End session error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateSession(req, res) {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      const result = await gameAnalyticsService.updateSession(parseInt(sessionId));

      res.json({
        success: true,
        result
      });
    } catch (error) {
      logger.error('Update session error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getUserMetrics(req, res) {
    try {
      const msisdn = req.msisdn;
      const metrics = await gameAnalyticsService.getUserMetrics(msisdn);

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Get user metrics error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getGameMetrics(req, res) {
    try {
      const { gameId } = req.params;
      const metrics = await gameAnalyticsService.getGameMetrics(parseInt(gameId));

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Get game metrics error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async addFavorite(req, res) {
    try {
      const { gameId } = req.body;
      const msisdn = req.msisdn;

      if (!gameId) {
        return res.status(400).json({
          success: false,
          error: 'Game ID is required'
        });
      }

      const favorite = await gameAnalyticsService.addFavorite(msisdn, parseInt(gameId));

      res.json({
        success: true,
        favorite
      });
    } catch (error) {
      logger.error('Add favorite error:', error.message);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async removeFavorite(req, res) {
    try {
      const { gameId } = req.body;
      const msisdn = req.msisdn;

      if (!gameId) {
        return res.status(400).json({
          success: false,
          error: 'Game ID is required'
        });
      }

      await gameAnalyticsService.removeFavorite(msisdn, parseInt(gameId));

      res.json({
        success: true,
        message: 'Favorite removed'
      });
    } catch (error) {
      logger.error('Remove favorite error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getUserFavorites(req, res) {
    try {
      const msisdn = req.msisdn;
      const favorites = await gameAnalyticsService.getUserFavorites(msisdn);

      res.json({
        success: true,
        favorites
      });
    } catch (error) {
      logger.error('Get user favorites error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPlayHistory(req, res) {
    try {
      const msisdn = req.msisdn;
      const limit = parseInt(req.query.limit) || 10;
      const history = await gameAnalyticsService.getPlayHistory(msisdn, limit);

      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Get play history error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async triggerScan(req, res) {
    try {
      gamesService.scanGames();
      res.json({
        success: true,
        message: 'Game scan initiated'
      });
    } catch (error) {
      logger.error('Trigger scan error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteGame(req, res) {
    try {
      const { gameId } = req.params;

      if (!gameId) {
        return res.status(400).json({
          success: false,
          error: 'Game ID is required'
        });
      }

      const result = await gamesService.deleteGame(parseInt(gameId));

      res.json({
        success: true,
        message: 'Game deleted successfully',
        game: result.game
      });
    } catch (error) {
      logger.error('Delete game error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new GamesController();