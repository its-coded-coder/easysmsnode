require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const gamesApiRoutes = require('./routes/games-api');
const gamesWebRoutes = require('./routes/games-web');
const schedulerService = require('./services/scheduler');
const paymentService = require('./services/payment');
const reportsService = require('./services/reports.service');
const authService = require('./services/auth.service');
const gamesService = require('./services/games.service');
const thumbnailService = require('./services/thumbnail.service');
const progressTracker = require('./utils/progress');
const logger = require('./utils/logger');
const { addUserInfo } = require('./middleware/auth.middleware');

class Application {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    
    // Support both payment-processor and games paths
    this.paymentPath = process.env.PAYMENT_BASE_PATH || '/payment-processor';
    this.gamesPath = process.env.GAMES_BASE_PATH || '/games';
    
    this.io = socketIo(this.server, {
      path: this.paymentPath + '/socket.io/',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupEventListeners();
  }

  setupMiddleware() {
    this.app.use((req, res, next) => {
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('X-Content-Security-Policy');
      res.removeHeader('X-WebKit-CSP');
      next();
    });

    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
          scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:", "blob:"],
          connectSrc: ["'self'", "https://easysms.co.ke", "wss://easysms.co.ke"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "blob:"],
          frameSrc: ["'self'"],
          childSrc: ["'self'", "blob:"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));
      
    this.app.use(cors());
    this.app.use(cookieParser());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Payment Processor static files
    this.app.use(this.paymentPath, express.static(path.join(__dirname, '../public')));
    
    // Games static files
    this.app.use(this.gamesPath, express.static(path.join(process.cwd(), process.env.GAMES_DIRECTORY || './games')));
    
    this.app.use(addUserInfo);
  }

  setupRoutes() {
    const webhookRoutes = require('./routes/webhooks');
    this.app.use('/', webhookRoutes);
    
    this.app.use(this.paymentPath + '/api', apiRoutes);
    this.app.use(this.paymentPath, webRoutes);
    
    this.app.use(this.gamesPath + '/api', gamesApiRoutes);
    this.app.use(this.gamesPath, gamesWebRoutes);
    
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'API endpoint not found'
      });
    });
    
    this.app.use((err, req, res, next) => {
      logger.error('Application error:', err.message);
      
      if (req.path.startsWith('/api/')) {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      } else {
        res.status(500).send('Internal server error');
      }
    });
  }

  extractSessionFromCookie(cookieString) {
    if (!cookieString) return null;
    
    try {
      const cookies = cookieString.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'sessionId') {
          return decodeURIComponent(value);
        }
      }
      return null;
    } catch (error) {
      logger.error('Error parsing cookies:', error.message);
      return null;
    }
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      let sessionId = null;
      
      if (socket.handshake.headers.cookie) {
        sessionId = this.extractSessionFromCookie(socket.handshake.headers.cookie);
      }
      
      if (!sessionId && socket.handshake.query.sessionId) {
        sessionId = socket.handshake.query.sessionId;
      }
      
      if (!sessionId && socket.handshake.headers['x-session-id']) {
        sessionId = socket.handshake.headers['x-session-id'];
      }
      
      if (!sessionId) {
        logger.info(`Socket connection without session: ${socket.id} - allowing connection`);
        socket.authenticated = false;
        socket.emit('authRequired');
        
        socket.on('authenticate', (data) => {
          if (data.sessionId) {
            const user = authService.validateSession(data.sessionId);
            if (user) {
              socket.user = user;
              socket.authenticated = true;
              socket.emit('authenticated', { success: true });
              logger.success(`Socket authenticated for user: ${user.username}`);
              
              socket.emit('schedulerStatus', schedulerService.getStatus());
              socket.emit('activeJobs', progressTracker.getAllActiveJobs());
            } else {
              socket.emit('authenticated', { success: false, error: 'Invalid session' });
            }
          }
        });
        
        socket.on('disconnect', () => {
          logger.info(`Unauthenticated client disconnected: ${socket.id}`);
        });
        
        return;
      }
      
      const user = authService.validateSession(sessionId);
      if (!user) {
        logger.warn(`Invalid session for socket connection: ${socket.id}`);
        socket.authenticated = false;
        socket.emit('authRequired');
        
        socket.on('disconnect', () => {
          logger.info(`Client with invalid session disconnected: ${socket.id}`);
        });
        
        return;
      }
      
      socket.user = user;
      socket.authenticated = true;
      logger.success(`Authenticated socket connection for user: ${user.username} (${socket.id})`);
      
      socket.emit('schedulerStatus', schedulerService.getStatus());
      socket.emit('activeJobs', progressTracker.getAllActiveJobs());
      
      socket.on('disconnect', () => {
        logger.info(`Authenticated client disconnected: ${user.username} (${socket.id})`);
      });
    });
  }

  setupEventListeners() {
    schedulerService.on('schedulerStarted', (data) => {
      logger.success(`Scheduler started - Every ${data.intervalHours} hours`);
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('schedulerStarted', data);
        }
      });
    });

    schedulerService.on('schedulerStopped', () => {
      logger.info('Scheduler stopped');
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('schedulerStopped');
        }
      });
    });

    schedulerService.on('jobStarted', (data) => {
      logger.info(`Job started: ${data.jobId} (${data.totalClients} clients)`);
      progressTracker.startJob(data.jobId, data.totalClients, 
        Math.ceil(data.totalClients / data.batchSize));
      
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('jobStarted', data);
        }
      });
    });

    schedulerService.on('batchCompleted', (data) => {
      progressTracker.updateBatchProgress(data.jobId, data.batchIndex, data.batchSize);
      
      const successfulInBatch = data.results.filter(r => r.success).length;
      const failedInBatch = data.results.filter(r => !r.success).length;
      
      logger.success(`Batch ${data.batchIndex}/${data.totalBatches} completed - Success: ${successfulInBatch}, Failed: ${failedInBatch}`);
      
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('batchCompleted', {
            ...data,
            successfulInBatch,
            failedInBatch
          });
        }
      });

      if (data.batchIndex % 5 === 0) {
        reportsService.clearCache();
      }
    });

    schedulerService.on('jobCompleted', (data) => {
      logger.success(`Job completed: ${data.jobId} - Total: ${data.totalClients}, Success: ${data.stats.successful}, Failed: ${data.stats.failed}`);
      progressTracker.completeJob(data.jobId);
      
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('jobCompleted', data);
        }
      });

      reportsService.clearCache();
      
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('reportsUpdate', {
            type: 'jobCompleted',
            data: data
          });
        }
      });
    });

    schedulerService.on('jobFailed', (data) => {
      logger.error(`Job failed: ${data.jobId} - ${data.error}`);
      progressTracker.completeJob(data.jobId);
      
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('jobFailed', data);
        }
      });
    });

    schedulerService.on('jobSkipped', (data) => {
      logger.warn(`Job skipped: ${data.reason}`);
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('jobSkipped', data);
        }
      });
    });

    schedulerService.on('settingsUpdated', (settings) => {
      logger.info('Scheduler settings updated');
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('settingsUpdated', settings);
        }
      });
    });

    paymentService.on('batchStarted', (data) => {
      this.io.sockets.sockets.forEach(socket => {
        if (socket.authenticated) {
          socket.emit('batchStarted', data);
        }
      });
    });
  }

  async start() {
    const port = config.server.port;
    
    try {
      const databaseService = require('./services/database');
      const dbConnected = await databaseService.testConnection();
      if (!dbConnected) {
        logger.error('Database connection failed on startup');
        logger.error('Please check your database configuration in .env file');
        process.exit(1);
      }
      logger.success('Database connection established');
    } catch (error) {
      logger.error('Database connection error:', error.message);
      logger.error('Please check your database configuration in .env file');
      process.exit(1);
    }
    
    try {
      authService.initialize();
      logger.success('Authentication service initialized');
    } catch (error) {
      logger.error('Failed to initialize authentication service:', error.message);
    }
    
    try {
      await schedulerService.initialize();
      logger.success('Scheduler service initialized');
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error.message);
    }

    try {
      await reportsService.initialize();
      logger.success('Reports service initialized with database optimization');
    } catch (error) {
      logger.error('Failed to initialize reports service:', error.message);
    }
    
    try {
      await thumbnailService.initialize();
      logger.success('Thumbnail service initialized');
    } catch (error) {
      logger.error('Failed to initialize thumbnail service:', error.message);
    }
    
    try {
      gamesService.startAutoScan();
      logger.success('Games service initialized with auto-scan');
    } catch (error) {
      logger.error('Failed to initialize games service:', error.message);
    }
    
    this.server.listen(port, '127.0.0.1', () => {
      logger.success(`Safaricom Payment Processor running on port ${port}`);
      logger.info(`Payment Processor: https://easysms.co.ke${this.paymentPath}/`);
      logger.info(`Payment API: https://easysms.co.ke${this.paymentPath}/api`);
      logger.info(`Login: https://easysms.co.ke${this.paymentPath}/login`);
      logger.info(`Reports: https://easysms.co.ke${this.paymentPath}/reports`);
      logger.info(`Games Portal: https://easysms.co.ke${this.gamesPath}/`);
      logger.info(`Games API: https://easysms.co.ke${this.gamesPath}/api`);
      
      const status = schedulerService.getStatus();
      if (status.enabled) {
        logger.info(`Scheduler is ACTIVE - Next run: ${status.nextRun ? status.nextRun.toLocaleString() : 'Unknown'}`);
      } else {
        logger.info('Scheduler is INACTIVE - Use web interface to start');
      }
    });

    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      schedulerService.stopScheduler();
      await thumbnailService.close();
      
      this.server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      
      setTimeout(() => {
        logger.warn('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error.message);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }
}

module.exports = Application;