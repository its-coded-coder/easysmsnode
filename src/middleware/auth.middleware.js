const authService = require('../services/auth.service');
const logger = require('../utils/logger');

// Middleware to require authentication
const requireAuth = (permissionLevel = 'user') => {
  return (req, res, next) => {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    
    if (!sessionId) {
      logger.warn(`Unauthorized access attempt to ${req.path} - No session`);
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        requiresLogin: true
      });
    }

    const user = authService.validateSession(sessionId);
    if (!user) {
      logger.warn(`Unauthorized access attempt to ${req.path} - Invalid session`);
      return res.status(401).json({
        success: false,
        error: 'Session expired or invalid',
        requiresLogin: true
      });
    }

    if (!authService.hasPermission(user, permissionLevel)) {
      logger.warn(`Forbidden access attempt to ${req.path} by user: ${user.username}`);
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    req.user = user;
    next();
  };
};

// Middleware to check if user is already authenticated (for login page)
const requireGuest = (req, res, next) => {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    const user = authService.validateSession(sessionId);
    if (user) {
      // User is already authenticated, redirect to dashboard
      return res.redirect('/payment-processor/');
    }
    // If session is invalid, clear the cookie and proceed to login
    res.clearCookie('sessionId');
  }
  
  next();
};

// Middleware to add user info to requests (optional auth)
const addUserInfo = (req, res, next) => {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    const user = authService.validateSession(sessionId);
    if (user) {
      req.user = user;
    } else {
      // Clear invalid session cookie
      res.clearCookie('sessionId');
    }
  }
  
  next();
};

module.exports = {
  requireAuth,
  requireGuest,
  addUserInfo
};