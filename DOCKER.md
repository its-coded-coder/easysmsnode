# Docker Setup Guide

This document provides comprehensive information about the Docker setup for the Safaricom Payment Processor.

## Overview

The application is fully containerized using Docker and Docker Compose, providing an isolated environment with all dependencies including a MySQL database.

## Architecture

### Services

#### 1. MySQL Service (`mysql`)
- **Image**: MySQL 8.0
- **Container Name**: safaricom-mysql
- **Port**: 3307 (host) → 3306 (container)
  - Mapped to port 3307 on host to avoid conflicts with system MySQL
  - Application connects internally via Docker network on port 3306
- **Features**:
  - Persistent data storage using Docker volumes
  - Health checks to ensure database is ready
  - UTF-8MB4 character set for full Unicode support
  - Configured for optimal performance
  - Timezone set to Africa/Nairobi

#### 2. Application Service (`app`)
- **Base Image**: Node.js 18 Alpine
- **Container Name**: safaricom-app
- **Port**: 3000
- **Features**:
  - Puppeteer/Chromium support for web automation
  - Automatic Prisma database migrations on startup
  - Non-root user execution for security
  - Health checks for application monitoring
  - Log and upload directories mounted to host

### Network

All services communicate on a private Docker bridge network (`safaricom-network`), isolated from external access except for exposed ports.

### Volumes

1. **mysql_data**: Persistent MySQL database storage
2. **./uploads**: Application uploads (mounted from host)
3. **./logs**: Application logs (mounted from host)

## File Structure

```
.
├── docker-compose.yml          # Docker Compose configuration
├── Dockerfile                  # Application container definition
├── .dockerignore              # Files to exclude from build
├── init-db.sql                # Database initialization script
├── .env.example               # Environment variables template
├── .env                       # Your configuration (create from .env.example)
└── docker-health-check.sh     # Pre-flight validation script
```

## Setup Instructions

### 1. Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- At least 2GB of available disk space
- Ports 3000 and 3307 available (3307 is used instead of 3306 to avoid conflicts with system MySQL)

### 2. Initial Setup

```bash
# Create environment file
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Configure Environment Variables

Edit `.env` and set the following required variables:

```env
# Safaricom API Credentials (REQUIRED)
SMS_API_USERNAME=your_safaricom_username
SMS_API_PASSWORD=your_safaricom_password
CPID=your_cpid
DEFAULT_OFFER_CODE=your_offer_code
CHARGE_AMOUNT=10

# Database Configuration (can use defaults)
DB_USER=safaricom
DB_PASSWORD=safaricompassword
DB_NAME=nurcana_sdp
DB_ROOT_PASSWORD=rootpassword

# Security (CHANGE IN PRODUCTION)
SESSION_SECRET=your-secure-random-secret-at-least-32-characters
```

### 4. Validate Setup

Run the health check script to validate your configuration:

```bash
./docker-health-check.sh
```

### 5. Start Services

```bash
# Start in background
docker-compose up -d

# Or start with logs visible
docker-compose up
```

### 6. Verify Services

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Check application health
curl http://localhost:3000/api/scheduler/status
```

## Common Operations

### Starting and Stopping

```bash
# Start services
docker-compose up -d

# Stop services (keeps data)
docker-compose stop

# Stop and remove containers (keeps data)
docker-compose down

# Stop and remove everything including volumes (DELETES DATA)
docker-compose down -v
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Application only
docker-compose logs -f app

# Database only
docker-compose logs -f mysql

# Last 100 lines
docker-compose logs --tail=100
```

### Rebuilding

```bash
# Rebuild after code changes
docker-compose up -d --build

# Force rebuild
docker-compose build --no-cache
docker-compose up -d
```

### Accessing Containers

```bash
# Access application container shell
docker-compose exec app sh

# Access MySQL from within container
docker-compose exec mysql mysql -u safaricom -p

# Access MySQL from host machine (port 3307)
mysql -h 127.0.0.1 -P 3307 -u safaricom -p

# Run Node.js commands
docker-compose exec app npm run <command>

# Run Prisma commands
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx prisma studio
```

### Database Operations

```bash
# Create database backup (from within container)
docker-compose exec mysql mysqldump -u safaricom -p nurcana_sdp > backup.sql

# Or backup from host machine (port 3307)
mysqldump -h 127.0.0.1 -P 3307 -u safaricom -p nurcana_sdp > backup.sql

# Restore database (from within container)
docker-compose exec -T mysql mysql -u safaricom -p nurcana_sdp < backup.sql

# Or restore from host machine (port 3307)
mysql -h 127.0.0.1 -P 3307 -u safaricom -p nurcana_sdp < backup.sql

# Access MySQL CLI (from within container)
docker-compose exec mysql mysql -u safaricom -p nurcana_sdp

# Or from host machine (port 3307)
mysql -h 127.0.0.1 -P 3307 -u safaricom -p nurcana_sdp
```

## Troubleshooting

### Container Won't Start

1. Check logs:
   ```bash
   docker-compose logs app
   ```

2. Verify environment variables:
   ```bash
   docker-compose config
   ```

3. Ensure ports are available:
   ```bash
   lsof -i :3000
   lsof -i :3307
   ```

### Database Connection Issues

1. Verify MySQL is healthy:
   ```bash
   docker-compose ps
   ```

2. Check database logs:
   ```bash
   docker-compose logs mysql
   ```

3. Test connection from app container:
   ```bash
   docker-compose exec app sh
   nc -zv mysql 3306
   ```

### Prisma Migration Issues

1. Run migrations manually:
   ```bash
   docker-compose exec app npx prisma migrate deploy
   ```

2. Generate Prisma client:
   ```bash
   docker-compose exec app npx prisma generate
   ```

3. Reset database (DELETES ALL DATA):
   ```bash
   docker-compose exec app npx prisma migrate reset
   ```

### Performance Issues

1. Check resource usage:
   ```bash
   docker stats
   ```

2. Increase Docker resources (Docker Desktop):
   - Settings → Resources → increase CPU/Memory

3. Clean up Docker system:
   ```bash
   docker system prune -a
   ```

## Security Considerations

### Production Deployment

1. **Change Default Passwords**
   ```env
   DB_PASSWORD=use-strong-random-password
   DB_ROOT_PASSWORD=use-strong-random-password
   SESSION_SECRET=use-strong-random-secret-at-least-32-chars
   ```

2. **Use Docker Secrets** (for Swarm/Kubernetes)
   ```bash
   echo "password" | docker secret create db_password -
   ```

3. **Limit Port Exposure**
   - Don't expose MySQL port (3306) to host in production
   - Use reverse proxy (nginx) for HTTPS

4. **Regular Updates**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

5. **Enable Firewall**
   ```bash
   ufw allow 3000/tcp
   ufw enable
   ```

### Port Configuration

The default setup uses port 3307 for MySQL to avoid conflicts with system MySQL. To change this:

1. Edit `docker-compose.yml`:
   ```yaml
   ports:
     - "3307:3306"  # Change 3307 to your preferred port
   ```

2. If you don't need external access to MySQL at all, you can remove the ports section entirely:
   ```yaml
   # Comment out or remove the entire ports section
   # ports:
   #   - "3307:3306"
   ```

   The application will still work perfectly as it connects via the internal Docker network.

### SSL/HTTPS

For production, use nginx or Caddy as a reverse proxy:

```yaml
# Add to docker-compose.yml
nginx:
  image: nginx:alpine
  ports:
    - "443:443"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
    - ./certs:/etc/nginx/certs
  depends_on:
    - app
```

## Monitoring

### Health Checks

Both services have built-in health checks:

```bash
# View health status
docker-compose ps

# Manual health check
docker-compose exec app node -e "console.log('Health check')"
```

### Log Rotation

Application logs are written to `./logs` directory. Set up log rotation:

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/safaricom-app

# Add:
/path/to/easysmsnode/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
}
```

## Backup and Recovery

### Automated Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T mysql mysqldump -u safaricom -p$DB_PASSWORD nurcana_sdp > backup_$DATE.sql
gzip backup_$DATE.sql
```

### Recovery

```bash
gunzip backup_20240101_120000.sql.gz
docker-compose exec -T mysql mysql -u safaricom -p nurcana_sdp < backup_20240101_120000.sql
```

## Scaling

For multiple instances behind a load balancer:

```bash
docker-compose up -d --scale app=3
```

Note: You'll need to configure a load balancer (nginx/HAProxy) separately.

## Environment-Specific Configurations

### Development

```env
NODE_ENV=development
```

### Production

```env
NODE_ENV=production
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [MySQL Docker Documentation](https://hub.docker.com/_/mysql)

## Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Run health check: `./docker-health-check.sh`
3. Review this documentation
4. Check application README.md
