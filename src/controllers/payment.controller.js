const schedulerService = require('../services/scheduler');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

class PaymentController {
  async startScheduler(req, res) {
    try {
      const dbConnected = await databaseService.testConnection();
      if (!dbConnected) {
        return res.status(500).json({
          success: false,
          error: 'Database connection failed'
        });
      }

      const {
        intervalHours = 4,
        batchSize = 10,
        includeInactive = false
      } = req.body;

      const hours = parseInt(intervalHours);
      const size = parseInt(batchSize);
      
      if (hours < 1 || hours > 12) {
        return res.status(400).json({
          success: false,
          error: 'Interval hours must be between 1 and 12'
        });
      }
      
      if (size < 5 || size > 100) {
        return res.status(400).json({
          success: false,
          error: 'Batch size must be between 5 and 100'
        });
      }

      // Check if scheduler is already running
      const currentStatus = await schedulerService.getStatus();
      if (currentStatus.enabled) {
        return res.status(400).json({
          success: false,
          error: 'Scheduler is already running'
        });
      }

      const result = await schedulerService.startScheduler({
        intervalHours: hours,
        batchSize: size,
        includeInactive: Boolean(includeInactive)
      });

      logger.success(`Scheduler started - Every ${hours} hours, batch size ${size}`);
      
      res.json({
        success: true,
        message: 'Scheduler started successfully',
        settings: schedulerService.getSettings(),
        nextRun: result.nextRun,
        upcomingSchedules: result.upcomingSchedules
      });
    } catch (error) {
      logger.error('Failed to start scheduler:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async stopScheduler(req, res) {
    try {
      const result = schedulerService.stopScheduler();
      logger.success('Scheduler stopped successfully');
      
      res.json({
        success: true,
        message: 'Scheduler stopped successfully',
        settings: schedulerService.getSettings()
      });
    } catch (error) {
      logger.error('Failed to stop scheduler:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async stopAllJobs(req, res) {
    try {
      const result = await schedulerService.stopAllJobs();
      
      if (result.success) {
        logger.success('All jobs stopped successfully');
        res.json({
          success: true,
          message: 'All jobs stopped successfully'
        });
      } else {
        logger.error('Failed to stop all jobs:', result.error);
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Failed to stop all jobs:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async runManualJob(req, res) {
    try {
      const dbConnected = await databaseService.testConnection();
      if (!dbConnected) {
        return res.status(500).json({
          success: false,
          error: 'Database connection failed'
        });
      }

      const {
        batchSize = 10,
        includeInactive = false
      } = req.body;

      const size = parseInt(batchSize);
      if (size < 5 || size > 100) {
        return res.status(400).json({
          success: false,
          error: 'Batch size must be between 5 and 100'
        });
      }

      logger.info('Starting manual payment job');
      
      schedulerService.executeManualJob({
        batchSize: size,
        includeInactive: Boolean(includeInactive)
      }).then(result => {
        if (result.success) {
          logger.success(`Manual job completed successfully: ${result.jobId}`);
        } else {
          logger.error(`Manual job failed: ${result.error}`);
        }
      }).catch(error => {
        logger.error(`Manual job error: ${error.message}`);
      });

      res.json({
        success: true,
        message: 'Manual job started successfully',
        note: 'Job is running in background, monitor progress in real-time'
      });
    } catch (error) {
      logger.error('Failed to start manual job:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getSchedulerStatus(req, res) {
    try {
      const status = await schedulerService.getStatus();
      const clientStats = await databaseService.getClientStats();
      
      // Ensure consistent status response
      const response = {
        success: true,
        status: {
          enabled: Boolean(status.enabled),
          isRunning: Boolean(status.isRunning),
          settings: status.settings,
          currentJob: status.currentJob,
          runningJobs: status.runningJobs || [],
          nextRun: status.nextRun,
          upcomingSchedules: status.upcomingSchedules || [],
          isScheduled: Boolean(status.isScheduled),
          cronActive: status.cronActive || 'stopped'
        },
        clientStats: {
          total: clientStats.total || 0,
          active: clientStats.active || 0,
          inactive: clientStats.inactive || 0
        }
      };
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to get scheduler status:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        status: {
          enabled: false,
          isRunning: false,
          settings: schedulerService.getSettings(),
          currentJob: null,
          runningJobs: [],
          nextRun: null,
          upcomingSchedules: [],
          isScheduled: false,
          cronActive: 'stopped'
        },
        clientStats: { total: 0, active: 0, inactive: 0 }
      });
    }
  }

  async updateSettings(req, res) {
    try {
      const {
        intervalHours,
        batchSize,
        includeInactive
      } = req.body;

      const settings = {};
      
      if (intervalHours !== undefined) {
        const hours = parseInt(intervalHours);
        if (hours < 1 || hours > 12) {
          return res.status(400).json({
            success: false,
            error: 'Interval hours must be between 1 and 12'
          });
        }
        settings.intervalHours = hours;
      }
      
      if (batchSize !== undefined) {
        const size = parseInt(batchSize);
        if (size < 5 || size > 100) {
          return res.status(400).json({
            success: false,
            error: 'Batch size must be between 5 and 100'
          });
        }
        settings.batchSize = size;
      }
      
      if (includeInactive !== undefined) {
        settings.includeInactive = Boolean(includeInactive);
      }

      schedulerService.updateSettings(settings);
      
      logger.success('Settings updated successfully');
      
      const status = await schedulerService.getStatus();
      
      res.json({
        success: true,
        message: 'Settings updated successfully',
        settings: schedulerService.getSettings(),
        nextRun: status.nextRun,
        upcomingSchedules: status.upcomingSchedules
      });
    } catch (error) {
      logger.error('Failed to update settings:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getJobHistory(req, res) {
    try {
      const { limit = 10 } = req.query;
      const limitInt = parseInt(limit);
      
      if (limitInt < 1 || limitInt > 100) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be between 1 and 100'
        });
      }
      
      const jobs = await databaseService.getRecentJobs(limitInt);
      
      res.json({
        success: true,
        jobs
      });
    } catch (error) {
      logger.error('Failed to get job history:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        jobs: []
      });
    }
  }

  async getJobDetails(req, res) {
    try {
      const { jobId } = req.params;
      
      if (!jobId || jobId.length !== 36) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job ID format'
        });
      }
      
      const job = await databaseService.getProcessingJob(jobId);
      
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }
      
      res.json({
        success: true,
        job
      });
    } catch (error) {
      logger.error('Failed to get job details:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getSystemStatus(req, res) {
    try {
      const schedulerStatus = await schedulerService.getStatus();
      const clientStats = await databaseService.getClientStats();
      const dbConnected = await databaseService.testConnection();
      
      res.json({
        success: true,
        system: {
          database: dbConnected ? 'connected' : 'disconnected',
          scheduler: schedulerStatus.enabled ? 'running' : 'stopped',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: require('../../package.json').version
        },
        scheduler: schedulerStatus,
        clients: clientStats
      });
    } catch (error) {
      logger.error('Failed to get system status:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new PaymentController();