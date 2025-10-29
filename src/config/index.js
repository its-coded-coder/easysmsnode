require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true
  },
  
  safaricom: {
    authUrl: "https://dsvc.safaricom.com:9480/api/auth/login",
    primaryServer: "https://dsvc.safaricom.com:9480/api/public/SDP/paymentRequest",
    fallbackServer: "https://dsvc2.safaricom.com:9480/api/public/SDP/paymentRequest",
    username: process.env.SMS_API_USERNAME,
    password: process.env.SMS_API_PASSWORD,
    cpId: process.env.CPID,
    defaultOfferCode: process.env.DEFAULT_OFFER_CODE,
    chargeAmount: process.env.CHARGE_AMOUNT,
    language: "en"
  },
  
  processing: {
    defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE) || 75,
    defaultIntervalHours: parseInt(process.env.DEFAULT_INTERVAL_HOURS) || 4,
    concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS) || 5,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 10000,
    tokenRefreshInterval: parseInt(process.env.TOKEN_REFRESH_INTERVAL) || 1500000,
    serverDistribution: 0.5,
    batchDelay: 100,
    maxRequestsPerDay: 6
  },
  
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'fallback-secret-key'
  }
};

module.exports = config;