class Logger {
  constructor() {
    this.enabledLevels = new Set(['info', 'success', 'warn', 'error']);
  }

  formatTime() {
    return new Date().toLocaleTimeString('en-GB', { 
      hour12: false,
      timeZone: 'Africa/Nairobi'
    });
  }

  log(level, message, data = null) {
    if (!this.enabledLevels.has(level)) return;
    
    const colors = {
      info: '\x1b[34m',
      success: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    
    const prefix = `${colors[level]}[${level.toUpperCase()}]${colors.reset}`;
    const timestamp = this.formatTime();
    
    if (data) {
      console.log(`${prefix} ${timestamp} ${message}`, data);
    } else {
      console.log(`${prefix} ${timestamp} ${message}`);
    }
  }

  info(message, data) {
    this.log('info', message, data);
  }

  success(message, data) {
    this.log('success', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  response(server, statusCode, description, duration, msisdn) {
    const message = `${msisdn} → ${server} → ${statusCode}: ${description} (${duration}ms)`;
    this.success(message);
  }

  setLogLevel(levels) {
    this.enabledLevels = new Set(levels);
  }
}

module.exports = new Logger();