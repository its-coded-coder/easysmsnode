const express = require('express');
const router = express.Router();
const gamesController = require('../controllers/games.controller');
const authController = require('../controllers/auth.controller');
const { requireGamesAuthAPI } = require('../middleware/games-auth.middleware');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/auth/me', authController.getCurrentUser);
router.get('/games', requireGamesAuthAPI, gamesController.getAllGames);
router.get('/games/:slug', requireGamesAuthAPI, gamesController.getGameBySlug);

router.post('/games/session/start', requireGamesAuthAPI, gamesController.startSession);
router.post('/games/session/end', requireGamesAuthAPI, gamesController.endSession);
router.post('/games/session/update', requireGamesAuthAPI, gamesController.updateSession);

router.get('/games/metrics/user', requireGamesAuthAPI, gamesController.getUserMetrics);
router.get('/games/metrics/:gameId', requireGamesAuthAPI, gamesController.getGameMetrics);

router.post('/games/favorites/add', requireGamesAuthAPI, gamesController.addFavorite);
router.post('/games/favorites/remove', requireGamesAuthAPI, gamesController.removeFavorite);
router.get('/games/favorites/list', requireGamesAuthAPI, gamesController.getUserFavorites);

router.get('/games/history/list', requireGamesAuthAPI, gamesController.getPlayHistory);

router.post('/games/scan', requireAuth('staff'), gamesController.triggerScan);
router.delete('/games/:gameId', requireAuth('staff'), gamesController.deleteGame);

module.exports = router;