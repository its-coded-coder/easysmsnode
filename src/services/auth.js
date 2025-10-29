const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.tokenCache = {
      token: null,
      expiresAt: 0
    };
    
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      family: 4,
      timeout: 8000,
      maxSockets: 100,
      maxFreeSockets: 50
    });
    
    axios.defaults.httpsAgent = this.httpsAgent;
  }

  async fetchToken() {
    try {
      const response = await axios.post(config.safaricom.authUrl, {
        username: config.safaricom.username,
        password: config.safaricom.password
      }, {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        timeout: 15000
      });
      
      if (response.data && response.data.token) {
        this.tokenCache.token = response.data.token;
        this.tokenCache.expiresAt = Date.now() + config.processing.tokenRefreshInterval;
        logger.success('Authentication token refreshed successfully');
        return response.data.token;
      }
      
      throw new Error("No token in response");
    } catch (error) {
      logger.error('Token fetch failed:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async getValidToken() {
    if (this.tokenCache.token && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }
    return await this.fetchToken();
  }

  clearToken() {
    this.tokenCache.token = null;
    this.tokenCache.expiresAt = 0;
    logger.info('Authentication token cleared');
  }

  isTokenValid() {
    return this.tokenCache.token && Date.now() < this.tokenCache.expiresAt;
  }

  getTokenInfo() {
    return {
      hasToken: !!this.tokenCache.token,
      expiresAt: this.tokenCache.expiresAt,
      isExpired: Date.now() >= this.tokenCache.expiresAt
    };
  }
}

module.exports = new AuthService();