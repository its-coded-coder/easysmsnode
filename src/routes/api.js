const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authController = require('../controllers/auth.controller');
const reportsController = require('../controllers/reports.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Authentication endpoints (no auth required)
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);

// Protected endpoints - require authentication
router.use(requireAuth('user')); // All routes below require authentication

// User info endpoints
router.get('/auth/me', authController.getCurrentUser);
router.get('/auth/session-info', authController.getSessionInfo);

// Scheduler control endpoints (require staff permissions)
router.post('/scheduler/start', requireAuth('staff'), paymentController.startScheduler);
router.post('/scheduler/stop', requireAuth('staff'), paymentController.stopScheduler);
router.post('/scheduler/settings', requireAuth('staff'), paymentController.updateSettings);

// Job management endpoints (require staff permissions)
router.post('/jobs/manual', requireAuth('staff'), paymentController.runManualJob);
router.post('/jobs/stop-all', requireAuth('staff'), paymentController.stopAllJobs);

// Read-only endpoints (all authenticated users can access)
router.get('/scheduler/status', paymentController.getSchedulerStatus);
router.get('/jobs/history', paymentController.getJobHistory);
router.get('/jobs/:jobId', paymentController.getJobDetails);
router.get('/system/status', paymentController.getSystemStatus);

// Reports endpoints - all authenticated users can access
router.get('/reports/dashboard', reportsController.getDashboardMetrics);
router.get('/reports/daily-revenue', reportsController.getDailyRevenue);
router.get('/reports/hourly-revenue', reportsController.getHourlyRevenue);
router.get('/reports/payment-analytics', reportsController.getPaymentAnalytics);
router.get('/reports/today', reportsController.getTodayMetrics);
router.get('/reports/revenue-comparison', reportsController.getRevenueComparison);
router.get('/reports/export-successful', reportsController.exportSuccessfulPayments);

// Cache management - staff only
router.post('/reports/cache/clear', requireAuth('staff'), reportsController.clearCache);

module.exports = router;