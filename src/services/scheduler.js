const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const databaseService = require('./database');
const paymentService = require('./payment');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class SchedulerService extends EventEmitter {
  constructor() {
    super();
    this.scheduledTask = null;
    this.currentJob = null;
    this.runningJobs = new Map();
    this.settings = {
      intervalHours: config.processing.defaultIntervalHours,
      batchSize: config.processing.defaultBatchSize,
      includeInactive: false,
      enabled: false
    };
    this.isInitialized = false;
    this.lastStatusCheck = 0;
    this.statusCheckInterval = 5000;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing scheduler service...');
      
      await databaseService.createSchedulerStateTable();
      await databaseService.createProcessingJobTable();
      
      const savedState = await databaseService.getSchedulerState();
      if (savedState && savedState.enabled) {
        this.settings = { ...this.settings, ...savedState };
        logger.info(`Restored scheduler state: Every ${this.settings.intervalHours} hours, batch size ${this.settings.batchSize}`);
        
        await this.startScheduler(this.settings);
        logger.success('Scheduler auto-started from saved state');
      } else {
        logger.info('No previous scheduler state found - scheduler is inactive');
      }
      
      this.startStatusVerification();
      
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error.message);
      this.isInitialized = true;
    }
  }

  startStatusVerification() {
    setInterval(async () => {
      try {
        const dbState = await databaseService.getSchedulerState();
        if (dbState) {
          const dbEnabled = Boolean(dbState.enabled);
          const currentEnabled = Boolean(this.settings.enabled);
          
          if (dbEnabled !== currentEnabled) {
            logger.info(`Syncing scheduler state - DB: ${dbEnabled}, Memory: ${currentEnabled}`);
            this.settings.enabled = dbEnabled;
            
            if (dbEnabled && !this.scheduledTask) {
              await this.startScheduler(dbState);
            } else if (!dbEnabled && this.scheduledTask) {
              this.stopScheduler(false);
            }
          }
        }
      } catch (error) {
        logger.error('Status verification error:', error.message);
      }
    }, this.statusCheckInterval);
  }

  generateCronExpression(intervalHours) {
    const times = [];
    for (let hour = 0; hour < 24; hour += intervalHours) {
      times.push(hour);
    }
    return `0 ${times.join(',')} * * *`;
  }

  getScheduleTimes(intervalHours) {
    const times = [];
    for (let hour = 0; hour < 24; hour += intervalHours) {
      times.push(hour);
    }
    return times;
  }

  async startScheduler(settings = {}) {
    try {
      this.settings = { ...this.settings, ...settings, enabled: true };
      
      await databaseService.saveSchedulerState(this.settings);
      logger.info('Scheduler state saved to database');
      
      this.stopScheduler(false);
      
      const cronExpression = this.generateCronExpression(this.settings.intervalHours);
      
      logger.info(`Starting scheduler with cron expression: ${cronExpression}`);
      
      this.scheduledTask = cron.schedule(cronExpression, async () => {
        logger.info('Scheduled job triggered by cron');
        
        if (this.currentJob && this.currentJob.status === 'running') {
          logger.warn('Previous job still running, skipping this execution');
          this.emit('jobSkipped', {
            reason: 'Previous job still running',
            timestamp: new Date()
          });
          return;
        }
        
        await this.executeScheduledJob();
      }, {
        scheduled: true,
        timezone: "Africa/Nairobi"
      });

      const nextRun = this.getNextRunTime();
      const upcomingSchedules = this.getNextRunTimes(5);
      logger.success(`Scheduler started successfully - runs every ${this.settings.intervalHours} hours`);
      if (nextRun) {
        logger.info(`Next scheduled run: ${nextRun.toLocaleString()}`);
      }
      
      this.emit('schedulerStarted', {
        cronExpression,
        intervalHours: this.settings.intervalHours,
        batchSize: this.settings.batchSize,
        includeInactive: this.settings.includeInactive,
        nextRun: nextRun,
        upcomingSchedules: upcomingSchedules
      });
      
      return { success: true, nextRun, upcomingSchedules };
      
    } catch (error) {
      logger.error('Failed to start scheduler:', error.message);
      throw error;
    }
  }

  stopScheduler(updateDatabase = true) {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      logger.info('Scheduled task stopped');
    }
    
    this.settings.enabled = false;
    
    if (updateDatabase) {
      databaseService.saveSchedulerState(this.settings).then(() => {
        logger.info('Scheduler disabled state saved to database');
      }).catch(error => {
        logger.error('Failed to save scheduler state:', error.message);
      });
    }
    
    this.emit('schedulerStopped');
    return { success: true };
  }

  async stopAllJobs() {
    try {
      logger.info('Stopping all running jobs...');
      
      this.stopScheduler();
      
      if (this.currentJob) {
        try {
          await databaseService.updateProcessingJob(this.currentJob.jobId, {
            status: 'failed',
            completed_at: new Date(),
            error_message: 'Job stopped by user'
          });
        } catch (error) {
          logger.error('Failed to update stopped job in database:', error.message);
        }
        
        this.currentJob = null;
      }
      
      for (const [jobId, job] of this.runningJobs) {
        try {
          await databaseService.updateProcessingJob(jobId, {
            status: 'failed',
            completed_at: new Date(),
            error_message: 'Job stopped by user'
          });
        } catch (error) {
          logger.error(`Failed to update stopped job ${jobId}:`, error.message);
        }
      }
      
      this.runningJobs.clear();
      
      logger.success('All jobs stopped successfully');
      
      this.emit('allJobsStopped');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to stop all jobs:', error.message);
      return { success: false, error: error.message };
    }
  }

  async executeScheduledJob() {
    const jobId = uuidv4();
    
    try {
      logger.info(`Starting scheduled job: ${jobId}`);
      
      const clients = await databaseService.getClients(this.settings.includeInactive);
      
      if (clients.length === 0) {
        logger.warn('No clients found for processing');
        return;
      }
      
      this.currentJob = {
        jobId,
        status: 'running',
        startTime: new Date(),
        totalClients: clients.length,
        isScheduled: true
      };
      
      this.runningJobs.set(jobId, this.currentJob);
      
      await databaseService.createProcessingJob({
        jobId,
        totalClients: clients.length,
        batchSize: this.settings.batchSize,
        includeInactive: this.settings.includeInactive
      });
      
      await databaseService.updateProcessingJob(jobId, {
        status: 'running',
        started_at: new Date()
      });
      
      logger.success(`Job created in database: ${jobId} (${clients.length} clients)`);
      
      this.emit('jobStarted', {
        jobId,
        totalClients: clients.length,
        batchSize: this.settings.batchSize,
        includeInactive: this.settings.includeInactive,
        isScheduled: true
      });
      
      const onBatchCompleted = (data) => {
        if (data.jobId === jobId) {
          this.emit('batchCompleted', { ...data, isScheduled: true });
          
          databaseService.updateProcessingJob(jobId, {
            processed_clients: data.batchIndex * this.settings.batchSize,
            successful_requests: paymentService.getStats().successful,
            failed_requests: paymentService.getStats().failed
          }).catch(error => {
            logger.error('Failed to update job progress:', error.message);
          });
        }
      };
      
      paymentService.on('batchCompleted', onBatchCompleted);
      
      const results = await paymentService.processClients(clients, this.settings.batchSize, jobId);
      
      paymentService.removeListener('batchCompleted', onBatchCompleted);
      
      const stats = paymentService.getStats();
      
      await databaseService.updateProcessingJob(jobId, {
        status: 'completed',
        completed_at: new Date(),
        processed_clients: clients.length,
        successful_requests: stats.successful,
        failed_requests: stats.failed,
        server_stats: JSON.stringify(stats)
      });
      
      this.currentJob.status = 'completed';
      this.currentJob.endTime = new Date();
      this.runningJobs.delete(jobId);
      this.currentJob = null;
      
      logger.success(`Scheduled job completed: ${jobId}`);
      logger.success(`Results: ${clients.length} clients, ${stats.successful} successful, ${stats.failed} failed`);
      
      this.emit('jobCompleted', {
        jobId,
        totalClients: clients.length,
        results,
        stats,
        isScheduled: true
      });
      
    } catch (error) {
      logger.error(`Scheduled job failed: ${jobId} - ${error.message}`);
      
      try {
        await databaseService.updateProcessingJob(jobId, {
          status: 'failed',
          completed_at: new Date(),
          error_message: error.message
        });
      } catch (dbError) {
        logger.error('Failed to update failed job in database:', dbError.message);
      }
      
      if (this.currentJob) {
        this.currentJob.status = 'failed';
        this.currentJob.error = error.message;
      }
      
      this.runningJobs.delete(jobId);
      this.currentJob = null;
      
      this.emit('jobFailed', {
        jobId,
        error: error.message,
        isScheduled: true
      });
    }
  }

  async executeManualJob(settings = {}) {
    const jobSettings = { ...this.settings, ...settings };
    const jobId = uuidv4();
    
    try {
      logger.info(`Starting manual job: ${jobId}`);
      
      const clients = await databaseService.getClients(jobSettings.includeInactive);
      
      if (clients.length === 0) {
        throw new Error('No clients found for processing');
      }
      
      const manualJob = {
        jobId,
        status: 'running',
        startTime: new Date(),
        totalClients: clients.length,
        isScheduled: false
      };
      
      this.runningJobs.set(jobId, manualJob);
      this.currentJob = manualJob;
      
      await databaseService.createProcessingJob({
        jobId,
        totalClients: clients.length,
        batchSize: jobSettings.batchSize,
        includeInactive: jobSettings.includeInactive
      });
      
      await databaseService.updateProcessingJob(jobId, {
        status: 'running',
        started_at: new Date()
      });
      
      logger.success(`Manual job created in database: ${jobId} (${clients.length} clients)`);
      
      this.emit('jobStarted', {
        jobId,
        totalClients: clients.length,
        batchSize: jobSettings.batchSize,
        includeInactive: jobSettings.includeInactive,
        isScheduled: false
      });
      
      const onBatchCompleted = (data) => {
        if (data.jobId === jobId) {
          this.emit('batchCompleted', { ...data, isScheduled: false });
          
          databaseService.updateProcessingJob(jobId, {
            processed_clients: data.batchIndex * jobSettings.batchSize,
            successful_requests: paymentService.getStats().successful,
            failed_requests: paymentService.getStats().failed
          }).catch(error => {
            logger.error('Failed to update job progress:', error.message);
          });
        }
      };
      
      paymentService.on('batchCompleted', onBatchCompleted);
      
      const results = await paymentService.processClients(clients, jobSettings.batchSize, jobId);
      
      paymentService.removeListener('batchCompleted', onBatchCompleted);
      
      const stats = paymentService.getStats();
      
      await databaseService.updateProcessingJob(jobId, {
        status: 'completed',
        completed_at: new Date(),
        processed_clients: clients.length,
        successful_requests: stats.successful,
        failed_requests: stats.failed,
        server_stats: JSON.stringify(stats)
      });
      
      this.runningJobs.delete(jobId);
      this.currentJob = null;
      
      logger.success(`Manual job completed: ${jobId}`);
      logger.success(`Results: ${clients.length} clients, ${stats.successful} successful, ${stats.failed} failed`);
      
      this.emit('jobCompleted', {
        jobId,
        totalClients: clients.length,
        results,
        stats,
        isScheduled: false
      });
      
      return { success: true, jobId, stats };
      
    } catch (error) {
      logger.error(`Manual job failed: ${jobId} - ${error.message}`);
      
      try {
        await databaseService.updateProcessingJob(jobId, {
          status: 'failed',
          completed_at: new Date(),
          error_message: error.message
        });
      } catch (dbError) {
        logger.error('Failed to update failed job in database:', dbError.message);
      }
      
      this.runningJobs.delete(jobId);
      this.currentJob = null;
      
      this.emit('jobFailed', {
        jobId,
        error: error.message,
        isScheduled: false
      });
      
      return { success: false, error: error.message };
    }
  }

  updateSettings(newSettings) {
    const wasEnabled = this.settings.enabled;
    this.settings = { ...this.settings, ...newSettings };
    
    databaseService.saveSchedulerState(this.settings).then(() => {
      logger.info('Settings updated and saved to database');
    }).catch(error => {
      logger.error('Failed to save scheduler settings:', error.message);
    });
    
    if (wasEnabled && this.settings.enabled) {
      this.startScheduler(this.settings).catch(error => {
        logger.error('Failed to restart scheduler with new settings:', error.message);
      });
    }
    
    this.emit('settingsUpdated', this.settings);
  }

  getSettings() {
    return { ...this.settings };
  }

  async getStatus() {
    try {
      const dbState = await databaseService.getSchedulerState();
      let actualEnabled = this.settings.enabled;
      
      if (dbState) {
        actualEnabled = Boolean(dbState.enabled);
        if (actualEnabled !== this.settings.enabled) {
          this.settings.enabled = actualEnabled;
        }
      }
      
      return {
        enabled: actualEnabled,
        isRunning: Boolean(this.scheduledTask),
        settings: this.settings,
        currentJob: this.currentJob,
        runningJobs: Array.from(this.runningJobs.values()),
        nextRun: this.getNextRunTime(),
        upcomingSchedules: this.getNextRunTimes(5),
        isScheduled: Boolean(this.scheduledTask),
        cronActive: this.scheduledTask ? 'running' : 'stopped'
      };
    } catch (error) {
      logger.error('Error getting scheduler status:', error.message);
      return {
        enabled: this.settings.enabled,
        isRunning: Boolean(this.scheduledTask),
        settings: this.settings,
        currentJob: this.currentJob,
        runningJobs: Array.from(this.runningJobs.values()),
        nextRun: this.getNextRunTime(),
        upcomingSchedules: this.getNextRunTimes(5),
        isScheduled: Boolean(this.scheduledTask),
        cronActive: this.scheduledTask ? 'running' : 'stopped'
      };
    }
  }

  getNextRunTime() {
    if (!this.settings.enabled || !this.scheduledTask) return null;
    
    try {
      const now = new Date();
      const intervalHours = this.settings.intervalHours;
      const scheduleTimes = this.getScheduleTimes(intervalHours);
      
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      for (const hour of scheduleTimes) {
        if (hour > currentHour || (hour === currentHour && currentMinute === 0)) {
          const nextRun = new Date(now);
          nextRun.setHours(hour, 0, 0, 0);
          return nextRun;
        }
      }
      
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(scheduleTimes[0], 0, 0, 0);
      return tomorrow;
      
    } catch (error) {
      logger.error('Error calculating next run time:', error.message);
      return null;
    }
  }

  getNextRunTimes(count = 5) {
    if (!this.settings.enabled || !this.scheduledTask) return [];
    
    try {
      const schedules = [];
      const intervalHours = this.settings.intervalHours;
      
      const firstRun = this.getNextRunTime();
      if (!firstRun) return [];
      
      schedules.push(new Date(firstRun));
      
      for (let i = 1; i < count; i++) {
        const nextRun = new Date(schedules[i - 1]);
        nextRun.setHours(nextRun.getHours() + intervalHours);
        schedules.push(nextRun);
      }
      
      return schedules;
      
    } catch (error) {
      logger.error('Error calculating upcoming schedules:', error.message);
      return [];
    }
  }
}

module.exports = new SchedulerService();