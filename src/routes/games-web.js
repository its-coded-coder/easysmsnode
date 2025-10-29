const express = require('express');
const path = require('path');
const router = express.Router();
const { requireGamesAuth } = require('../middleware/games-auth.middleware');
const gamesService = require('../services/games.service');

const gamesPath = process.env.GAMES_BASE_PATH || '/games';

// Games listing page
router.get('/', requireGamesAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/games.html'));
});

// Game player page
router.get('/:slug', requireGamesAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/game-player.html'));
});

// Game play redirect
router.get('/:slug/play', requireGamesAuth, async (req, res) => {
  try {
    const game = await gamesService.getGameBySlug(req.params.slug);

    if (!game) {
      return res.status(404).send('Game not found');
    }

    // Redirect to the actual game file within the games path
    res.redirect(`${gamesPath}/${game.game_file}/${game.entry_file}`);
  } catch (error) {
    console.error('Error loading game:', error);
    res.status(500).send('Error loading game');
  }
});

module.exports = router;