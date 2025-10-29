const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const authService = require('./auth');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class PaymentService extends EventEmitter {
  constructor() {
    super();
    this.stats = {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      primaryServerRequests: 0,
      fallbackServerRequests: 0,
      primaryServerSuccess: 0,
      fallbackServerSuccess: 0,
      startTime: 0,
      errors: {
        timeout: 0,
        connection: 0,
        server: 0,
        auth: 0,
        other: 0
      }
    };
    this.failedQueue = [];
    this.maxRetries = 3;
  }

  selectServer() {
    const usePrimary = Math.random() < config.processing.serverDistribution;
    
    if (usePrimary) {
      this.stats.primaryServerRequests++;
      return { url: config.safaricom.primaryServer, type: 'PRIMARY' };
    } else {
      this.stats.fallbackServerRequests++;
      return { url: config.safaricom.fallbackServer, type: 'FALLBACK' };
    }
  }

  async processSinglePayment(client, isRetry = false) {
    const server = this.selectServer();
    const requestId = uuidv4();
    
    try {
      if (isRetry) {
        logger.info(`RETRY: Processing payment for ${client.msisdn} via ${server.type} server (Attempt ${client.retryCount + 1})`);
      } else {
        logger.info(`Processing payment for ${client.msisdn} via ${server.type} server`);
      }
      
      const token = await authService.getValidToken();
      
      const payload = {
        requestId,
        channel: "APIGW",
        requestParam: {
          data: [
            { name: "OfferCode", value: client.offer_code || config.safaricom.defaultOfferCode },
            { name: "Msisdn", value: client.msisdn },
            { name: "Language", value: config.safaricom.language },
            { name: "CpId", value: config.safaricom.cpId },
            { name: "ChargeAmount", value: config.safaricom.chargeAmount }
          ]
        },
        operation: "Payment"
      };
      
      const headers = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Authorization": `Bearer ${token}`
      };
      
      logger.info(`Sending request to ${server.url} for ${client.msisdn}`);
      
      const startTime = Date.now();
      
      const response = await axios.post(server.url, payload, {
        headers,
        timeout: config.processing.requestTimeout
      });
      
      const duration = Date.now() - startTime;
      this.stats.totalRequests++;
      this.stats.successful++;
      
      if (isRetry) {
        this.stats.retried++;
      }
      
      if (server.type === 'PRIMARY') {
        this.stats.primaryServerSuccess++;
      } else {
        this.stats.fallbackServerSuccess++;
      }
      
      const statusCode = response.data?.responseParam?.statusCode || 'unknown';
      const description = response.data?.responseParam?.description || 'No description';
      
      const retryPrefix = isRetry ? 'RETRY SUCCESS: ' : '';
      logger.success(`${retryPrefix}${client.msisdn} → ${server.type} → ${statusCode}: ${description} (${duration}ms)`);
      
      return {
        success: true,
        server: server.type,
        duration,
        statusCode,
        description,
        msisdn: client.msisdn,
        isRetry
      };
      
    } catch (error) {
      this.stats.totalRequests++;
      this.stats.failed++;
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        this.stats.errors.timeout++;
      } else if (error.code && error.code.startsWith('ECONN')) {
        this.stats.errors.connection++;
      } else if (error.response && error.response.status >= 500) {
        this.stats.errors.server++;
      } else if (error.response && error.response.status === 401) {
        this.stats.errors.auth++;
      } else {
        this.stats.errors.other++;
      }
      
      const retryCount = client.retryCount || 0;
      const retryPrefix = isRetry ? 'RETRY FAILED: ' : '';
      logger.error(`${retryPrefix}${client.msisdn} → ${server.type} → FAILED: ${error.message}`);
      
      // Add to retry queue if under max retries
      if (retryCount < this.maxRetries) {
        const clientForRetry = { 
          ...client, 
          retryCount: retryCount + 1,
          lastError: error.message,
          lastAttempt: new Date()
        };
        this.failedQueue.push(clientForRetry);
        logger.warn(`${client.msisdn} added to retry queue (attempt ${retryCount + 1}/${this.maxRetries})`);
      } else {
        logger.error(`${client.msisdn} failed permanently after ${this.maxRetries} attempts`);
      }
      
      return {
        success: false,
        server: server.type,
        error: error.message,
        msisdn: client.msisdn,
        retryCount,
        willRetry: retryCount < this.maxRetries,
        isRetry
      };
    }
  }

  async processBatchParallel(batch) {
    // Create all promises simultaneously - no delays between requests
    const batchPromises = batch.map(client => {
      const isRetry = client.retryCount > 0;
      return this.processSinglePayment(client, isRetry);
    });
    
    // Execute all requests in parallel
    const results = await Promise.allSettled(batchPromises);
    
    // Process results
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason.message || 'Unknown error',
          server: 'UNKNOWN'
        };
      }
    });
  }

  async processClients(clients, batchSize = config.processing.defaultBatchSize, jobId) {
    this.resetStats();
    this.stats.startTime = Date.now();
    this.failedQueue = [];
    
    logger.info(`Starting payment processing for ${clients.length} clients with batch size ${batchSize}`);
    logger.info(`Retry policy: Max ${this.maxRetries} attempts per client`);
    
    const results = [];
    let allClients = [...clients];
    let batchIndex = 0;
    
    this.emit('processingStarted', {
      jobId,
      totalClients: clients.length,
      totalBatches: Math.ceil(clients.length / batchSize),
      batchSize
    });
    
    while (allClients.length > 0 || this.failedQueue.length > 0) {
      batchIndex++;
      
      const regularBatch = allClients.splice(0, Math.max(1, batchSize - this.failedQueue.length));
      const retryBatch = this.failedQueue.splice(0, batchSize - regularBatch.length);
      const currentBatch = [...regularBatch, ...retryBatch];
      
      if (currentBatch.length === 0) break;
      
      const retryCount = retryBatch.length;
      if (retryCount > 0) {
        logger.info(`Processing batch ${batchIndex} - ${currentBatch.length} clients (${retryCount} retries)`);
      } else {
        logger.info(`Processing batch ${batchIndex} - ${currentBatch.length} clients`);
      }
      
      this.emit('batchStarted', {
        jobId,
        batchIndex,
        totalBatches: Math.ceil((allClients.length + currentBatch.length + this.failedQueue.length) / batchSize),
        batchSize: currentBatch.length,
        retryCount
      });
      
      const batchResults = await this.processBatchParallel(currentBatch);
      
      results.push(...batchResults);
      
      const successfulInBatch = batchResults.filter(r => r.success).length;
      const failedInBatch = batchResults.filter(r => !r.success).length;
      const retriedInBatch = batchResults.filter(r => r.isRetry && r.success).length;
      
      if (retriedInBatch > 0) {
        logger.success(`Batch ${batchIndex} completed - Success: ${successfulInBatch}, Failed: ${failedInBatch}, Retry Success: ${retriedInBatch}`);
      } else {
        logger.success(`Batch ${batchIndex} completed - Success: ${successfulInBatch}, Failed: ${failedInBatch}`);
      }
      
      if (this.failedQueue.length > 0) {
        logger.info(`${this.failedQueue.length} clients queued for retry in next batch`);
      }
      
      this.emit('batchCompleted', {
        jobId,
        batchIndex,
        totalBatches: Math.ceil((allClients.length + this.failedQueue.length) / batchSize) + batchIndex,
        results: batchResults,
        batchSize: currentBatch.length,
        successfulInBatch,
        failedInBatch,
        retryCount,
        queuedForRetry: this.failedQueue.length
      });
      
      if (allClients.length > 0 || this.failedQueue.length > 0) {
        logger.info(`Waiting ${config.processing.batchDelay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.processing.batchDelay));
      }
    }
    
    const finalStats = this.getStats();
    const permanentFailures = this.stats.failed - this.stats.retried;
    
    logger.success(`Payment processing completed: ${clients.length} clients processed`);
    logger.success(`Final stats: ${finalStats.successful} successful, ${finalStats.retried} retried, ${permanentFailures} permanent failures`);
    
    if (permanentFailures > 0) {
      logger.warn(`${permanentFailures} clients failed permanently after ${this.maxRetries} retry attempts`);
    } else {
      logger.success(`All clients processed successfully! Zero requests lost.`);
    }
    
    this.emit('processingCompleted', {
      jobId,
      totalClients: clients.length,
      results,
      stats: finalStats
    });
    
    return results;
  }

  resetStats() {
    this.stats = {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      primaryServerRequests: 0,
      fallbackServerRequests: 0,
      primaryServerSuccess: 0,
      fallbackServerSuccess: 0,
      startTime: Date.now(),
      errors: {
        timeout: 0,
        connection: 0,
        server: 0,
        auth: 0,
        other: 0
      }
    };
  }

  getStats() {
    const duration = Math.max(Date.now() - this.stats.startTime, 1);
    
    const totalRequests = parseInt(this.stats.totalRequests) || 0;
    const successful = parseInt(this.stats.successful) || 0;
    const failed = parseInt(this.stats.failed) || 0;
    const retried = parseInt(this.stats.retried) || 0;
    const primaryServerRequests = parseInt(this.stats.primaryServerRequests) || 0;
    const fallbackServerRequests = parseInt(this.stats.fallbackServerRequests) || 0;
    const primaryServerSuccess = parseInt(this.stats.primaryServerSuccess) || 0;
    const fallbackServerSuccess = parseInt(this.stats.fallbackServerSuccess) || 0;
    
    const rate = totalRequests > 0 && duration > 0 ? 
      parseFloat((totalRequests / (duration / 1000)).toFixed(1)) : 0;
    
    const successRate = totalRequests > 0 ? 
      parseFloat(((successful / totalRequests) * 100).toFixed(1)) : 0;
    
    const primarySuccessRate = primaryServerRequests > 0 ? 
      parseFloat(((primaryServerSuccess / primaryServerRequests) * 100).toFixed(1)) : 0;
    
    const fallbackSuccessRate = fallbackServerRequests > 0 ? 
      parseFloat(((fallbackServerSuccess / fallbackServerRequests) * 100).toFixed(1)) : 0;
    
    const permanentFailures = failed - retried;
    
    return {
      totalRequests: totalRequests,
      successful: successful,
      failed: failed,
      retried: retried,
      primaryServerRequests: primaryServerRequests,
      fallbackServerRequests: fallbackServerRequests,
      primaryServerSuccess: primaryServerSuccess,
      fallbackServerSuccess: fallbackServerSuccess,
      duration: parseInt(duration),
      rate: isFinite(rate) ? rate : 0,
      successRate: isFinite(successRate) ? successRate : 0,
      primarySuccessRate: isFinite(primarySuccessRate) ? primarySuccessRate : 0,
      fallbackSuccessRate: isFinite(fallbackSuccessRate) ? fallbackSuccessRate : 0,
      permanentFailures: permanentFailures >= 0 ? permanentFailures : 0,
      errors: {
        timeout: parseInt(this.stats.errors.timeout) || 0,
        connection: parseInt(this.stats.errors.connection) || 0,
        server: parseInt(this.stats.errors.server) || 0,
        auth: parseInt(this.stats.errors.auth) || 0,
        other: parseInt(this.stats.errors.other) || 0
      }
    };
  }
}

module.exports = new PaymentService();