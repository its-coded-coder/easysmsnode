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

### Docker Deployment (Recommended)

The easiest way to run this application is with Docker, which includes an isolated MySQL database:

1. **Prerequisites**
   - Docker (20.10 or higher)
   - Docker Compose (2.0 or higher)

2. **Setup**
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd easysmsnode

   # Create .env file from example
   cp .env.example .env

   # Edit .env with your Safaricom API credentials
   nano .env
   ```

3. **Configure Environment Variables**

   Edit `.env` and update the following required fields:
   ```env
   SMS_API_USERNAME=your_safaricom_username
   SMS_API_PASSWORD=your_safaricom_password
   CPID=your_cpid
   DEFAULT_OFFER_CODE=your_offer_code
   CHARGE_AMOUNT=10
   SESSION_SECRET=your-secure-random-secret
   ```

4. **Start the Application**
   ```bash
   # Build and start all services
   docker-compose up -d

   # View logs
   docker-compose logs -f

   # Check status
   docker-compose ps
   ```

5. **Access the Application**
   - Web Interface: http://localhost:3000
   - MySQL Database: localhost:3307 (mapped to avoid conflicts with system MySQL)

   Note: The Docker MySQL runs on port 3307 on your host machine to avoid conflicts with any existing MySQL installation on port 3306. The application container connects to MySQL internally via the Docker network on port 3306.

6. **Useful Docker Commands**
   ```bash
   # Stop services
   docker-compose down

   # Rebuild after code changes
   docker-compose up -d --build

   # View application logs
   docker-compose logs -f app

   # View database logs
   docker-compose logs -f mysql

   # Execute commands in container
   docker-compose exec app sh
   docker-compose exec mysql mysql -u safaricom -p

   # Access MySQL from host machine
   mysql -h 127.0.0.1 -P 3307 -u safaricom -p

   # Reset everything (including database)
   docker-compose down -v
   ```

### Local Development (Without Docker)

```bash
# Install dependencies
npm install

# Setup MySQL database
mysql -u root -p < init-db.sql

# Configure environment
cp .env.example .env
nano .env
# Change DB_HOST to 127.0.0.1 or localhost

# Run Prisma migrations
npx prisma migrate deploy
npx prisma generate

# Start application
npm start
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

## Docker Architecture

The Docker setup includes:

### Services
- **MySQL 8.0**: Isolated database with persistent volume storage
- **Node.js App**: Application container with Puppeteer/Chromium support

### Features
- **Health Checks**: Automatic monitoring of both services
- **Automatic Database Migrations**: Prisma migrations run on container startup
- **Persistent Data**: Database data is stored in Docker volumes
- **Network Isolation**: Services communicate on a private Docker network
- **Timezone Configuration**: Set to Africa/Nairobi
- **Non-root User**: Application runs as unprivileged user for security
- **Log Persistence**: Application logs are mounted to host filesystem

### Volume Mounts
- `mysql_data`: Database files (persistent)
- `./uploads`: User uploads (shared with host)
- `./logs`: Application logs (shared with host)

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