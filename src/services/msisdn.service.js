const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class MsisdnService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
  }

  async fetchMsisdn(headers) {
    try {
      const configResponse = await axios.get(config.safaricom.configUrl, {
        headers: {
          'Cookie': headers.cookie || '',
          'User-Agent': headers['user-agent'] || 'Mozilla/5.0'
        },
        timeout: 5000
      });

      if (!configResponse.data || !configResponse.data.t) {
        return { success: false, error: 'No token in config response' };
      }

      const token = configResponse.data.t;

      const msisdnResponse = await axios.get(config.safaricom.msisdnUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Source-System': 'he-partner',
          'X-App': 'he-partner'
        },
        timeout: 5000
      });

      if (msisdnResponse.data?.header?.responseCode === 403) {
        return { success: false, error: 'MSISDN not found', needsVerify: true };
      }

      if (msisdnResponse.data?.body?.msisdn) {
        return { success: true, msisdn: msisdnResponse.data.body.msisdn };
      }

      return { success: false, error: 'No MSISDN in response' };
    } catch (error) {
      logger.error('MSISDN fetch error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async getMsisdn(headers) {
    const cacheKey = headers.cookie || headers['user-agent'] || 'default';
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const result = await this.fetchMsisdn(headers);
    
    if (result.success) {
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    }

    return result;
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new MsisdnService();