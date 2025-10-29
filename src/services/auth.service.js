const crypto = require('crypto');
const databaseService = require('./database');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.activeSessions = new Map();
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  // Verify Django-style pbkdf2_sha256 password
  async verifyDjangoPassword(password, hashedPassword) {
    try {
      const parts = hashedPassword.split('$');
      if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
        return false;
      }

      const iterations = parseInt(parts[1]);
      const salt = parts[2];
      const hash = parts[3];

      const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
      const derivedHash = derived.toString('base64');

      return derivedHash === hash;
    } catch (error) {
      logger.error('Password verification error:', error.message);
      return false;
    }
  }

  // Authenticate user with username and password
  async authenticateUser(username, password) {
    try {
      const query = `
        SELECT id, username, first_name, last_name, email, password, is_active, is_superuser, is_staff
        FROM auth_user 
        WHERE username = ? AND is_active = 1
      `;
      
      const [rows] = await databaseService.pool.execute(query, [username]);
      
      if (rows.length === 0) {
        logger.warn(`Login attempt for non-existent user: ${username}`);
        return null;
      }

      const user = rows[0];
      const isValidPassword = await this.verifyDjangoPassword(password, user.password);

      if (!isValidPassword) {
        logger.warn(`Invalid password for user: ${username}`);
        return null;
      }

      // Update last login
      await databaseService.pool.execute(
        'UPDATE auth_user SET last_login = NOW() WHERE id = ?',
        [user.id]
      );

      logger.success(`User authenticated successfully: ${username}`);
      
      return {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isActive: Boolean(user.is_active),
        isSuperuser: Boolean(user.is_superuser),
        isStaff: Boolean(user.is_staff)
      };
    } catch (error) {
      logger.error('Authentication error:', error.message);
      return null;
    }
  }

  // Create session for authenticated user
  createSession(user) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    this.activeSessions.set(sessionId, {
      user,
      expiresAt,
      createdAt: new Date()
    });

    logger.info(`Session created for user: ${user.username}`);
    return { sessionId, expiresAt };
  }

  // Validate session
  validateSession(sessionId) {
    if (!sessionId) return null;

    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return null;
    }

    return session.user;
  }

  // Destroy session
  destroySession(sessionId) {
    if (sessionId && this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      this.activeSessions.delete(sessionId);
      logger.info(`Session destroyed for user: ${session.user.username}`);
      return true;
    }
    return false;
  }

  // Clean expired sessions
  cleanExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned ${cleanedCount} expired sessions`);
    }
  }

  // Get active sessions count
  getActiveSessionsCount() {
    this.cleanExpiredSessions();
    return this.activeSessions.size;
  }

  // Check if user has required permissions
  hasPermission(user, requiredLevel = 'user') {
    if (!user || !user.isActive) return false;

    switch (requiredLevel) {
      case 'superuser':
        return user.isSuperuser;
      case 'staff':
        return user.isStaff || user.isSuperuser;
      case 'user':
      default:
        return true;
    }
  }

  // Initialize session cleanup interval
  initialize() {
    // Clean expired sessions every hour
    setInterval(() => {
      this.cleanExpiredSessions();
    }, 60 * 60 * 1000);

    logger.info('Authentication service initialized');
  }
}

module.exports = new AuthService();