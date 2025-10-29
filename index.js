#!/usr/bin/env node

/**
 * Safaricom Payment Processor
 * Entry point for the application
 */

require('dotenv').config();

const Application = require('./app');
const logger = require('./utils/logger');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message);
  logger.error(error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise);
  logger.error('Reason:', reason);
  process.exit(1);
});

// Create and start the application
const app = new Application();

async function startApplication() {
  try {
    await app.start();
    logger.success('Payment Processor started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error.message);
    process.exit(1);
  }
}

// Start the application
startApplication();