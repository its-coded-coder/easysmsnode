FROM node:18-alpine

WORKDIR /app

# Install system dependencies for Puppeteer/Chromium and timezone
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tzdata \
    && cp /usr/share/zoneinfo/Africa/Nairobi /etc/localtime \
    && echo "Africa/Nairobi" > /etc/timezone

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for Prisma)
RUN npm ci && npm cache clean --force

# Copy application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Create user and set permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S safaricom -u 1001 && \
    mkdir -p /app/uploads /app/logs && \
    chown -R safaricom:nodejs /app

# Switch to non-root user
USER safaricom

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const http = require('http'); \
              const options = { hostname: 'localhost', port: 3000, path: '/api/scheduler/status', timeout: 2000 }; \
              const req = http.get(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); \
              req.on('error', () => process.exit(1)); \
              req.on('timeout', () => { req.destroy(); process.exit(1); });"

# Start script that runs migrations and starts the app
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
