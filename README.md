# Safaricom Payment Processor

A sophisticated Node.js application for automated Safaricom payment processing with scheduling capabilities, real-time monitoring, and web-based configuration.

## Features

- **Automated Scheduling**: Process payments every 4 hours (configurable) up to 6 times per day
- **Manual Job Execution**: Run payment jobs on-demand
- **Real-time Monitoring**: Live progress tracking with WebSocket updates
- **Web Interface**: Clean, responsive dashboard for configuration and monitoring
- **Load Balancing**: Distributes requests between primary and fallback Safaricom servers
- **Clean Logging**: Server responses with progress bars, no unnecessary clutter
- **Job History**: Track all processing jobs with detailed statistics

## Quick Start

### Local Development
```bash
./setup.sh
cd safaricom-payment-processor
npm install
# Edit .env file with your configuration
npm start
```

### Docker Deployment
```bash
docker-compose up -d
```

### Production Deployment
```bash
sudo ./deploy.sh
sudo nano /opt/safaricom-payment-processor/.env
sudo systemctl start safaricom-payment-processor
```

## Configuration

Edit `.env` file with your database and Safaricom API credentials:

```env
# Database
DB_HOST=127.0.0.1
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=nurcana_sdp

# Safaricom API
SAFARICOM_USERNAME=your_username
SAFARICOM_PASSWORD=your_password
```

## Usage

1. Access web interface: `http://localhost:3000`
2. Configure scheduling parameters
3. Start/stop scheduler or run manual jobs
4. Monitor real-time progress and view job history

## API Endpoints

- `POST /api/scheduler/start` - Start scheduler
- `POST /api/scheduler/stop` - Stop scheduler
- `POST /api/jobs/manual` - Run manual job
- `GET /api/scheduler/status` - Get status
- `GET /api/jobs/history` - Get job history

## Architecture

- **Modular Design**: Clean separation of services, controllers, and utilities
- **Event-Driven**: Real-time updates via WebSocket
- **Scalable**: Concurrent processing with load balancing
- **Secure**: Input validation, token management, environment-based config
- **Monitored**: Comprehensive logging and progress tracking

## Production Features

- Systemd service integration
- Log rotation
- Health checks
- Graceful shutdown
- Resource limits
- Security hardening

## License

MIT License


<!-- More misc -->

Complete Ubuntu server installation:
```bash
sudo apt-get update && sudo apt-get install -y \
  chromium-browser \
  chromium-codecs-ffmpeg \
  fonts-liberation \
  libasound2t64 \
  libatk-bridge2.0-0t64 \
  libatk1.0-0t64 \
  libatspi2.0-0t64 \
  libcups2t64 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0t64 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils

  ```

  Then verify Chromium path:
```bash
which chromium-browser
```