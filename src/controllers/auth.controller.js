const authService = require('../services/auth.service');
const logger = require('../utils/logger');

class AuthController {
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const user = await authService.authenticateUser(username.trim(), password);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid username or password'
        });
      }

      const { sessionId, expiresAt } = authService.createSession(user);

      // Set secure HTTP-only cookie
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt
      });

      logger.success(`User logged in: ${user.username}`);

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          isStaff: user.isStaff,
          isSuperuser: user.isSuperuser
        }
      });
    } catch (error) {
      logger.error('Login error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async logout(req, res) {
    try {
      const sessionId = req.cookies?.sessionId;
      
      if (sessionId) {
        authService.destroySession(sessionId);
        res.clearCookie('sessionId');
      }

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getCurrentUser(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      res.json({
        success: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          isStaff: req.user.isStaff,
          isSuperuser: req.user.isSuperuser
        }
      });
    } catch (error) {
      logger.error('Get current user error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getSessionInfo(req, res) {
    try {
      const activeSessionsCount = authService.getActiveSessionsCount();
      
      res.json({
        success: true,
        activeSessionsCount,
        currentUser: req.user ? {
          username: req.user.username,
          isStaff: req.user.isStaff,
          isSuperuser: req.user.isSuperuser
        } : null
      });
    } catch (error) {
      logger.error('Get session info error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = new AuthController();