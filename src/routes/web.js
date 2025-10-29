const express = require('express');
const path = require('path');
const router = express.Router();
const { requireAuth, requireGuest, addUserInfo } = require('../middleware/auth.middleware');

const paymentPath = process.env.PAYMENT_BASE_PATH || '/payment-processor';

// Login page (only accessible to guests)
router.get('/login', requireGuest, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/login.html'));
});

// Main dashboard (protected - server-side authentication check)
router.get('/', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.redirect(paymentPath + '/login');
  }
  
  const authService = require('../services/auth.service');
  const user = authService.validateSession(sessionId);
  
  if (!user) {
    res.clearCookie('sessionId');
    return res.redirect(paymentPath + '/login');
  }
  
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Reports page (protected - same authentication check as dashboard)
router.get('/reports', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.redirect(paymentPath + '/login');
  }
  
  const authService = require('../services/auth.service');
  const user = authService.validateSession(sessionId);
  
  if (!user) {
    res.clearCookie('sessionId');
    return res.redirect(paymentPath + '/login');
  }
  
  res.sendFile(path.join(__dirname, '../../public/reports.html'));
});

// API routes for checking authentication status (for AJAX calls)
router.get('/auth-check', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.json({ authenticated: false });
  }
  
  const authService = require('../services/auth.service');
  const user = authService.validateSession(sessionId);
  
  if (!user) {
    res.clearCookie('sessionId');
    return res.json({ authenticated: false });
  }
  
  res.json({ 
    authenticated: true, 
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isStaff: user.isStaff,
      isSuperuser: user.isSuperuser
    }
  });
});

// Logout redirect
router.get('/logout', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    const authService = require('../services/auth.service');
    authService.destroySession(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.redirect(paymentPath + '/login');
});

// Redirect dashboard alias to main route
router.get('/dashboard', (req, res) => {
  res.redirect(paymentPath + '/');
});

// Catch-all for other routes - redirect to login if not authenticated
router.get('*', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.redirect(paymentPath + '/login');
  }
  
  const authService = require('../services/auth.service');
  const user = authService.validateSession(sessionId);
  
  if (!user) {
    res.clearCookie('sessionId');
    return res.redirect(paymentPath + '/login');
  }
  
  res.redirect(paymentPath + '/');
});

module.exports = router;