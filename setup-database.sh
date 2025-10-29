#!/bin/bash

# Database Setup Script
# Run this after starting Docker containers for the first time

set -e

echo "================================================"
echo "Database Setup for Safaricom Payment Processor"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Checking if containers are running...${NC}"
if ! docker-compose ps | grep -q "safaricom-app.*Up"; then
    echo "Error: Containers are not running!"
    echo "Please start containers first with: docker-compose up -d"
    exit 1
fi
echo -e "${GREEN}✓ Containers are running${NC}"
echo ""

echo -e "${YELLOW}Step 2: Pushing Prisma schema to database...${NC}"
docker-compose exec -T app npx prisma db push --accept-data-loss

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Database schema created successfully!${NC}"
else
    echo ""
    echo "Error: Failed to create database schema"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Generating Prisma client...${NC}"
docker-compose exec -T app npx prisma generate

echo ""
echo -e "${YELLOW}Step 4: Restarting application...${NC}"
docker-compose restart app

echo ""
echo "================================================"
echo -e "${GREEN}Database setup complete!${NC}"
echo "================================================"
echo ""
echo "Your application is now ready to use:"
echo "  - Web Interface: http://localhost:3000"
echo "  - MySQL Database: localhost:3307"
echo ""
echo "View logs with: docker-compose logs -f app"
echo ""
