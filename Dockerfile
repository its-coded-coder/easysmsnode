FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache \
    tzdata \
    && cp /usr/share/zoneinfo/Africa/Nairobi /etc/localtime \
    && echo "Africa/Nairobi" > /etc/timezone \
    && apk del tzdata

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN addgroup -g 1001 -S nodejs
RUN adduser -S safaricom -u 1001

RUN chown -R safaricom:nodejs /app
USER safaricom

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
              const options = { hostname: 'localhost', port: 3000, path: '/api/scheduler/status', timeout: 2000 }; \
              const req = http.get(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); \
              req.on('error', () => process.exit(1)); \
              req.on('timeout', () => { req.destroy(); process.exit(1); });"

CMD ["npm", "start"]
