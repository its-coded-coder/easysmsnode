module.exports = {
  apps: [{
    name: 'payment-processor',
    script: './src/index.js',
    cwd: '/home/nurcana/easysms_g_sdp/g_sdp/main_charging/safaricom-payment-processor',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      BASE_PATH: '/payment-processor'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000,
      BASE_PATH: ''
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};