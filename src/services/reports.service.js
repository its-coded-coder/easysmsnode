const databaseService = require('./database');
const logger = require('../utils/logger');

class ReportsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000;
    this.isOptimizing = false;
  }

  getCacheKey(method, params) {
    return `${method}_${JSON.stringify(params)}`;
  }

  async getCachedResult(method, params, callback) {
    const key = this.getCacheKey(method, params);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    const result = await callback();
    this.cache.set(key, { data: result, timestamp: Date.now() });
    return result;
  }

  async optimizeDatabase() {
    if (this.isOptimizing) return;
    this.isOptimizing = true;
    
    try {
      logger.info('Optimizing database indexes for reports...');
      
      const optimizationQueries = [
        'CREATE INDEX idx_payments_timestamp_status ON payments(timestamp, status)',
        'CREATE INDEX idx_payments_timestamp_desc ON payments(timestamp DESC)',
        'CREATE INDEX idx_payments_status_timestamp_desc ON payments(status, timestamp DESC)',
        'CREATE INDEX idx_payments_offer_timestamp ON payments(offer_code, timestamp)',
        'ANALYZE TABLE payments'
      ];
      
      for (const query of optimizationQueries) {
        try {
          await databaseService.pool.execute(query);
          logger.info(`Created index: ${query.substring(13, 50)}...`);
        } catch (error) {
          if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
            logger.info(`Index already exists: ${query.substring(13, 50)}...`);
          } else {
            logger.warn(`Index creation warning: ${error.message}`);
          }
        }
      }
      
      logger.success('Database optimization completed');
    } catch (error) {
      logger.error('Database optimization error:', error.message);
    } finally {
      this.isOptimizing = false;
    }
  }

  async getDashboardMetrics(timeRange = 'daily') {
    return await this.getCachedResult('dashboard', { timeRange }, async () => {
      try {
        const dateFilter = this.getDateFilter(timeRange);
        
        const [totalResults] = await databaseService.pool.execute(`
          SELECT 
            COUNT(*) as totalTransactions,
            SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as totalRevenue,
            COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successfulTransactions,
            COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failedTransactions,
            COUNT(DISTINCT CASE WHEN status = 'SUCCESS' THEN msisdn END) as successfulUsers
          FROM payments 
          WHERE timestamp >= ?
        `, [dateFilter]);

        const total = totalResults[0];
        const successRate = total.totalTransactions > 0 ? 
          ((total.successfulTransactions / total.totalTransactions) * 100).toFixed(1) : 0;

        return {
          summary: {
            totalTransactions: total.totalTransactions,
            totalRevenue: parseFloat(total.totalRevenue || 0),
            successfulTransactions: total.successfulTransactions,
            failedTransactions: total.failedTransactions,
            successfulUsers: total.successfulUsers,
            successRate: parseFloat(successRate)
          }
        };
      } catch (error) {
        logger.error('Dashboard metrics error:', error.message);
        throw error;
      }
    });
  }

  async getTodayMetrics() {
    return await this.getCachedResult('today', {}, async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [results] = await databaseService.pool.execute(`
          SELECT 
            SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as todayRevenue,
            COUNT(DISTINCT CASE WHEN status = 'SUCCESS' THEN msisdn END) as successfulUsers,
            COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successfulPayments,
            COUNT(*) as totalPayments,
            AVG(CASE WHEN status = 'SUCCESS' THEN amount END) as avgPaymentAmount
          FROM payments 
          WHERE timestamp >= ?
        `, [today]);

        const result = results[0];
        const successRate = result.totalPayments > 0 ? 
          ((result.successfulPayments / result.totalPayments) * 100).toFixed(1) : 0;

        return {
          todayRevenue: parseFloat(result.todayRevenue || 0),
          successfulUsers: result.successfulUsers || 0,
          successfulPayments: result.successfulPayments || 0,
          totalPayments: result.totalPayments || 0,
          successRate: parseFloat(successRate),
          avgPaymentAmount: parseFloat(result.avgPaymentAmount || 0)
        };
      } catch (error) {
        logger.error('Today metrics error:', error.message);
        throw error;
      }
    });
  }

  async getRevenueComparison() {
    return await this.getCachedResult('revenue_comparison', {}, async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const [todayQuery, yesterdayQuery] = await Promise.all([
          databaseService.pool.execute(`
            SELECT 
              SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as revenue,
              COUNT(DISTINCT CASE WHEN status = 'SUCCESS' THEN msisdn END) as users
            FROM payments 
            WHERE timestamp >= ? AND timestamp < ?
          `, [today, new Date()]),
          
          databaseService.pool.execute(`
            SELECT 
              SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as revenue,
              COUNT(DISTINCT CASE WHEN status = 'SUCCESS' THEN msisdn END) as users
            FROM payments 
            WHERE timestamp >= ? AND timestamp < ?
          `, [yesterday, today])
        ]);

        const todayRevenue = parseFloat(todayQuery[0][0].revenue || 0);
        const todayUsers = todayQuery[0][0].users || 0;
        const yesterdayRevenue = parseFloat(yesterdayQuery[0][0].revenue || 0);
        const yesterdayUsers = yesterdayQuery[0][0].users || 0;

        const revenueChange = yesterdayRevenue > 0 ? 
          (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1) : 0;
        
        const usersChange = yesterdayUsers > 0 ? 
          (((todayUsers - yesterdayUsers) / yesterdayUsers) * 100).toFixed(1) : 0;

        return {
          today: { revenue: todayRevenue, users: todayUsers },
          yesterday: { revenue: yesterdayRevenue, users: yesterdayUsers },
          changes: { revenue: parseFloat(revenueChange), users: parseFloat(usersChange) }
        };
      } catch (error) {
        logger.error('Revenue comparison error:', error.message);
        throw error;
      }
    });
  }

  async getDailyRevenue(timeRange = 'daily') {
    return await this.getCachedResult('daily_revenue', { timeRange }, async () => {
      try {
        const dateFilter = this.getDateFilter(timeRange);
        const maxDays = timeRange === 'monthly' ? 90 : timeRange === 'weekly' ? 30 : 7;
        
        const [results] = await databaseService.pool.execute(`
          SELECT 
            DATE(timestamp) as date,
            SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as dailyRevenue,
            COUNT(DISTINCT CASE WHEN status = 'SUCCESS' THEN msisdn END) as successfulUsers
          FROM payments 
          WHERE timestamp >= ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ${maxDays} DAY)
          GROUP BY DATE(timestamp)
          ORDER BY date DESC
          LIMIT 50
        `, [dateFilter]);

        return results.map(row => ({
          date: row.date,
          dailyRevenue: parseFloat(row.dailyRevenue || 0),
          successfulUsers: row.successfulUsers || 0
        })).reverse();
      } catch (error) {
        logger.error('Daily revenue error:', error.message);
        throw error;
      }
    });
  }

  async getHourlyRevenue(date) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return await this.getCachedResult('hourly_revenue', { date: targetDate.toISOString() }, async () => {
      try {
        const [results] = await databaseService.pool.execute(`
          SELECT 
            HOUR(timestamp) as hour,
            SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as hourlyRevenue
          FROM payments 
          WHERE timestamp >= ? AND timestamp < ?
          GROUP BY HOUR(timestamp)
          ORDER BY hour ASC
        `, [targetDate, nextDay]);

        const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          hourlyRevenue: 0
        }));

        results.forEach(row => {
          hourlyData[row.hour] = {
            hour: row.hour,
            hourlyRevenue: parseFloat(row.hourlyRevenue || 0)
          };
        });

        return hourlyData;
      } catch (error) {
        logger.error('Hourly revenue error:', error.message);
        throw error;
      }
    });
  }

  async getPaymentAnalytics(timeRange = 'daily') {
    return await this.getCachedResult('payment_analytics', { timeRange }, async () => {
      try {
        const dateFilter = this.getDateFilter(timeRange);

        const [statusQuery, offerQuery, failureQuery] = await Promise.all([
          databaseService.pool.execute(`
            SELECT status, COUNT(*) as count
            FROM payments 
            WHERE timestamp >= ?
            GROUP BY status
            ORDER BY count DESC
          `, [dateFilter]),
          
          databaseService.pool.execute(`
            SELECT 
              offer_code as offerCode,
              COUNT(*) as successfulPayments,
              COUNT(DISTINCT msisdn) as successfulUsers,
              SUM(amount) as totalRevenue,
              AVG(amount) as avgAmount
            FROM payments 
            WHERE timestamp >= ? AND status = 'SUCCESS'
            GROUP BY offer_code
            ORDER BY successfulPayments DESC
            LIMIT 10
          `, [dateFilter]),
          
          databaseService.pool.execute(`
            SELECT 
              description,
              COUNT(*) as failureCount,
              COUNT(DISTINCT msisdn) as affectedUsers
            FROM payments 
            WHERE timestamp >= ? AND status = 'FAILED' AND description IS NOT NULL
            GROUP BY description
            ORDER BY failureCount DESC
            LIMIT 10
          `, [dateFilter])
        ]);

        return {
          statusBreakdown: statusQuery[0].map(row => ({
            status: row.status,
            count: row.count
          })),
          offerPerformance: offerQuery[0].map(row => ({
            offerCode: row.offerCode,
            successfulPayments: row.successfulPayments,
            successfulUsers: row.successfulUsers,
            totalRevenue: parseFloat(row.totalRevenue || 0),
            avgAmount: parseFloat(row.avgAmount || 0)
          })),
          failureReasons: failureQuery[0].map(row => ({
            description: row.description,
            failureCount: row.failureCount,
            affectedUsers: row.affectedUsers
          }))
        };
      } catch (error) {
        logger.error('Payment analytics error:', error.message);
        throw error;
      }
    });
  }

  async exportSuccessfulPayments(timeRange = 'daily') {
    try {
      const dateFilter = this.getDateFilter(timeRange);
      
      const [results] = await databaseService.pool.execute(`
        SELECT 
          id, msisdn, request_id, offer_code, amount, timestamp, status, description
        FROM payments 
        WHERE timestamp >= ? AND status = 'SUCCESS'
        ORDER BY timestamp DESC
        LIMIT 5000
      `, [dateFilter]);

      const headers = ['ID', 'MSISDN', 'Request ID', 'Offer Code', 'Amount', 'Timestamp', 'Status', 'Description'];
      const csvData = [headers.join(',')];
      
      results.forEach(row => {
        const rowData = [
          row.id,
          row.msisdn,
          row.request_id,
          row.offer_code,
          row.amount,
          row.timestamp,
          row.status,
          row.description ? `"${row.description.replace(/"/g, '""')}"` : ''
        ];
        csvData.push(rowData.join(','));
      });

      return csvData.join('\n');
    } catch (error) {
      logger.error('Export successful payments error:', error.message);
      throw error;
    }
  }

  getDateFilter(timeRange) {
    const now = new Date();
    
    switch (timeRange) {
      case 'hourly':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  clearCache() {
    this.cache.clear();
    logger.info('Reports cache cleared');
  }

  async initialize() {
    setTimeout(() => {
      this.optimizeDatabase();
    }, 5000);
  }
}

module.exports = new ReportsService();