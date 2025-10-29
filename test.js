// test-direct.js
const path = require('path');
const fs = require('fs');

console.log('Current directory:', __dirname);
console.log('.env path:', path.join(__dirname, '.env'));
console.log('.env exists:', fs.existsSync(path.join(__dirname, '.env')));
console.log('');

// Load dotenv
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('Environment variables loaded:');
console.log('SMS_API_USERNAME:', process.env.SMS_API_USERNAME || 'NOT SET');
console.log('SMS_API_PASSWORD:', process.env.SMS_API_PASSWORD ? 'SET (***' + process.env.SMS_API_PASSWORD.slice(-3) + ')' : 'NOT SET');
console.log('');

// Now load config
const config = require('./src/config');

console.log('Config values:');
console.log('username:', config.safaricom.username || 'NOT SET');
console.log('password:', config.safaricom.password ? 'SET (***' + config.safaricom.password.slice(-3) + ')' : 'NOT SET');