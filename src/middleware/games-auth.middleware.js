const authService = require('../services/auth.service');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

async function requireGamesAuth(req, res, next) {
  try {
    // Check admin session FIRST
    const sessionId = req.cookies?.sessionId;
    
    if (sessionId) {
      const user = authService.validateSession(sessionId);
      if (user) {
        req.user = user;
        req.msisdn = 'admin';
        logger.info(`Admin user ${user.username} accessing games portal`);
        return next();
      }
    }

    // Check for Django's verified MSISDN cookie
    const verifiedMsisdn = req.cookies?.verified_msisdn;
    
    if (!verifiedMsisdn) {
      logger.warn('No verified MSISDN cookie found, redirecting to verify');
      return res.redirect('/verify');
    }

    // Verify active subscription in database
    const [rows] = await databaseService.pool.execute(
      'SELECT msisdn, subscription_status FROM clients WHERE msisdn = ? AND subscription_status = ?',
      [verifiedMsisdn, 'A']
    );

    if (rows.length === 0) {
      logger.warn(`Inactive or non-existent client: ${verifiedMsisdn}`);
      return res.redirect('/verify');
    }

    req.msisdn = verifiedMsisdn;
    logger.info(`MSISDN ${verifiedMsisdn} authenticated via Django cookie`);
    next();
  } catch (error) {
    logger.error('Games auth middleware error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
}

async function requireGamesAuthAPI(req, res, next) {
  try {
    // Check admin session FIRST
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    
    if (sessionId) {
      const user = authService.validateSession(sessionId);
      if (user) {
        req.user = user;
        req.msisdn = 'admin';
        return next();
      }
    }

    // Check for Django's verified MSISDN cookie
    const verifiedMsisdn = req.cookies?.verified_msisdn;

    if (!verifiedMsisdn) {
      return res.status(403).json({
        success: false,
        error: 'MSISDN verification required',
        needsVerify: true
      });
    }

    // Verify active subscription in database
    const [rows] = await databaseService.pool.execute(
      'SELECT msisdn, subscription_status FROM clients WHERE msisdn = ? AND subscription_status = ?',
      [verifiedMsisdn, 'A']
    );

    if (rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Inactive subscription',
        needsVerify: true
      });
    }

    req.msisdn = verifiedMsisdn;
    next();
  } catch (error) {
    logger.error('Games auth API middleware error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
}

module.exports = {
  requireGamesAuth,
  requireGamesAuthAPI
};