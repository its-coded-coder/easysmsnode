#!/bin/bash

# Docker Setup Health Check Script
# This script validates your Docker setup before running docker-compose

set -e

echo "================================================"
echo "Docker Setup Health Check"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Docker
echo -n "Checking Docker installation... "
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
    docker --version
else
    echo -e "${RED}✗${NC}"
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

echo ""

# Check Docker Compose
echo -n "Checking Docker Compose installation... "
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
    docker-compose --version 2>/dev/null || docker compose version
else
    echo -e "${RED}✗${NC}"
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo ""

# Check required files
echo "Checking required files..."
files=("Dockerfile" "docker-compose.yml" "init-db.sql" ".dockerignore" "package.json" "prisma/schema.prisma")
for file in "${files[@]}"; do
    echo -n "  - $file... "
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "Error: Required file $file is missing!"
        exit 1
    fi
done

echo ""

# Check .env file
echo -n "Checking .env file... "
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC}"

    # Check critical env variables
    echo "Checking critical environment variables..."
    required_vars=("SMS_API_USERNAME" "SMS_API_PASSWORD" "CPID" "DEFAULT_OFFER_CODE" "DB_PASSWORD" "SESSION_SECRET")
    missing_vars=()

    for var in "${required_vars[@]}"; do
        echo -n "  - $var... "
        if grep -q "^${var}=" .env && ! grep -q "^${var}=your_" .env && ! grep -q "^${var}=$" .env; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}⚠${NC}"
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Warning: The following variables need to be configured in .env:${NC}"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Please edit .env file and set proper values before running docker-compose."
    fi
else
    echo -e "${RED}✗${NC}"
    echo ""
    echo "Error: .env file not found!"
    echo "Please run: cp .env.example .env"
    echo "Then edit .env with your configuration."
    exit 1
fi

echo ""

# Validate docker-compose.yml syntax
echo -n "Validating docker-compose.yml syntax... "
if docker-compose config > /dev/null 2>&1 || docker compose config > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo "Error: docker-compose.yml has syntax errors!"
    exit 1
fi

echo ""

# Check port availability
echo "Checking port availability..."
ports=(3000 3306)
for port in "${ports[@]}"; do
    echo -n "  - Port $port... "
    if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 && ! netstat -tuln 2>/dev/null | grep -q ":$port " ; then
        echo -e "${GREEN}✓ (available)${NC}"
    else
        echo -e "${YELLOW}⚠ (in use)${NC}"
        echo "    Warning: Port $port is already in use. Docker may fail to start."
    fi
done

echo ""
echo "================================================"
echo -e "${GREEN}Health check complete!${NC}"
echo "================================================"
echo ""
echo "To start the application:"
echo "  docker-compose up -d"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
