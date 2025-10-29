-- Database initialization script for Safaricom Payment Processor
-- This script runs automatically when the MySQL container is first created

-- Set default character set and collation
SET NAMES utf8mb4;
SET character_set_client = utf8mb4;

-- Configure MySQL settings for optimal performance
SET GLOBAL max_connections = 200;
SET GLOBAL connect_timeout = 10;
SET GLOBAL wait_timeout = 28800;
SET GLOBAL interactive_timeout = 28800;

-- Ensure the database uses utf8mb4
ALTER DATABASE IF EXISTS nurcana_sdp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The actual schema will be created by Prisma migrations
-- This file is mainly for MySQL configuration and initial setup
