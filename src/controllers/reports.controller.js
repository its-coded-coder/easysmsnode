const reportsService = require('../services/reports.service');
const logger = require('../utils/logger');

class ReportsController {
  async getDashboardMetrics(req, res) {
    try {
      const { timeRange = 'daily' } = req.query;
      
      const metrics = await reportsService.getDashboardMetrics(timeRange);
      
      res.json({
        success: true,
        data: metrics,
        timeRange
      });
    } catch (error) {
      logger.error('Dashboard metrics error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDailyRevenue(req, res) {
    try {
      const { timeRange = 'daily' } = req.query;
      
      const data = await reportsService.getDailyRevenue(timeRange);
      
      res.json({
        success: true,
        data,
        timeRange
      });
    } catch (error) {
      logger.error('Daily revenue error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getHourlyRevenue(req, res) {
    try {
      const { date } = req.query;
      
      const data = await reportsService.getHourlyRevenue(date);
      
      res.json({
        success: true,
        data,
        date: date || new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      logger.error('Hourly revenue error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPaymentAnalytics(req, res) {
    try {
      const { timeRange = 'daily' } = req.query;
      
      const analytics = await reportsService.getPaymentAnalytics(timeRange);
      
      res.json({
        success: true,
        data: analytics,
        timeRange
      });
    } catch (error) {
      logger.error('Payment analytics error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getTodayMetrics(req, res) {
    try {
      const metrics = await reportsService.getTodayMetrics();
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Today metrics error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRevenueComparison(req, res) {
    try {
      const comparison = await reportsService.getRevenueComparison();
      
      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      logger.error('Revenue comparison error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async exportSuccessfulPayments(req, res) {
    try {
      const { timeRange = 'daily' } = req.query;
      
      const data = await reportsService.exportSuccessfulPayments(timeRange);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="successful_payments_${timeRange}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(data);
    } catch (error) {
      logger.error('Export successful payments error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async clearCache(req, res) {
    try {
      reportsService.clearCache();
      
      res.json({
        success: true,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      logger.error('Clear cache error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new ReportsController();