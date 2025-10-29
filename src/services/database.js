const mysql = require('mysql2/promise');
const config = require('../config');

class DatabaseService {
  constructor() {
    this.pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      charset: config.database.charset,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async getClients(includeInactive = false) {
    try {
      const statusCondition = includeInactive ? 
        "subscription_status IN ('A', 'I')" : 
        "subscription_status = 'A'";
      
      const query = `
        SELECT msisdn, offer_code, subscription_status, last_payment_date
        FROM clients 
        WHERE ${statusCondition}
        AND msisdn REGEXP '^[0-9]{9,15}$'
        AND msisdn NOT LIKE '%None%'
        AND msisdn != ''
        AND msisdn IS NOT NULL
        AND offer_code != ''
        AND offer_code IS NOT NULL
        ORDER BY RAND()
      `;
      
      const [rows] = await this.pool.execute(query);
      return rows;
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  }

  async getClientStats() {
    try {
      const baseCondition = `
        msisdn REGEXP '^[0-9]{9,15}$'
        AND msisdn NOT LIKE '%None%'
        AND msisdn != ''
        AND msisdn IS NOT NULL
        AND offer_code != ''
        AND offer_code IS NOT NULL
      `;

      const totalQuery = `SELECT COUNT(*) as total FROM clients WHERE ${baseCondition}`;
      const [totalRows] = await this.pool.execute(totalQuery);
      
      const activeQuery = `SELECT COUNT(*) as active FROM clients WHERE subscription_status = 'A' AND ${baseCondition}`;
      const [activeRows] = await this.pool.execute(activeQuery);
      
      const inactiveQuery = `SELECT COUNT(*) as inactive FROM clients WHERE subscription_status = 'I' AND ${baseCondition}`;
      const [inactiveRows] = await this.pool.execute(inactiveQuery);
      
      return {
        total: totalRows[0].total,
        active: activeRows[0].active,
        inactive: inactiveRows[0].inactive
      };
    } catch (error) {
      console.error('Error fetching client stats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async createProcessingJobTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS processing_jobs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          job_id VARCHAR(36) UNIQUE NOT NULL,
          status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
          total_clients INT DEFAULT 0,
          processed_clients INT DEFAULT 0,
          successful_requests INT DEFAULT 0,
          failed_requests INT DEFAULT 0,
          batch_size INT DEFAULT 75,
          include_inactive BOOLEAN DEFAULT FALSE,
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          error_message TEXT NULL,
          server_stats JSON NULL,
          INDEX idx_job_id (job_id),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at)
        )
      `;
      
      await this.pool.execute(createTableQuery);
    } catch (error) {
      console.error('Error creating processing_jobs table:', error);
      throw error;
    }
  }

  async createSchedulerStateTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS scheduler_state (
          id INT PRIMARY KEY DEFAULT 1,
          enabled BOOLEAN DEFAULT FALSE,
          interval_hours INT DEFAULT 4,
          batch_size INT DEFAULT 75,
          include_inactive BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `;
      
      await this.pool.execute(createTableQuery);
    } catch (error) {
      console.error('Error creating scheduler_state table:', error);
      throw error;
    }
  }

  async saveSchedulerState(settings) {
    try {
      await this.createSchedulerStateTable();
      
      const query = `
        INSERT INTO scheduler_state (id, enabled, interval_hours, batch_size, include_inactive) 
        VALUES (1, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          enabled = VALUES(enabled),
          interval_hours = VALUES(interval_hours),
          batch_size = VALUES(batch_size),
          include_inactive = VALUES(include_inactive),
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await this.pool.execute(query, [
        settings.enabled ? 1 : 0,
        settings.intervalHours,
        settings.batchSize,
        settings.includeInactive ? 1 : 0
      ]);
    } catch (error) {
      console.error('Error saving scheduler state:', error);
      throw error;
    }
  }

  async getSchedulerState() {
    try {
      await this.createSchedulerStateTable();
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM scheduler_state WHERE id = 1'
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      const row = rows[0];
      return {
        enabled: Boolean(row.enabled),
        intervalHours: row.interval_hours,
        batchSize: row.batch_size,
        includeInactive: Boolean(row.include_inactive)
      };
    } catch (error) {
      console.error('Error fetching scheduler state:', error);
      return null;
    }
  }

  async createProcessingJob(jobData) {
    try {
      await this.createProcessingJobTable();
      
      const query = `
        INSERT INTO processing_jobs (job_id, total_clients, batch_size, include_inactive, status)
        VALUES (?, ?, ?, ?, 'pending')
      `;
      
      await this.pool.execute(query, [
        jobData.jobId,
        jobData.totalClients,
        jobData.batchSize,
        jobData.includeInactive ? 1 : 0
      ]);
    } catch (error) {
      console.error('Error creating processing job:', error);
      throw error;
    }
  }

  async updateProcessingJob(jobId, updates) {
    try {
      await this.createProcessingJobTable();
      
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      
      const query = `UPDATE processing_jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`;
      await this.pool.execute(query, [...values, jobId]);
    } catch (error) {
      console.error('Error updating processing job:', error);
      throw error;
    }
  }

  async getProcessingJob(jobId) {
    try {
      await this.createProcessingJobTable();
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM processing_jobs WHERE job_id = ?',
        [jobId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching processing job:', error);
      return null;
    }
  }

  async getRecentJobs(limit = 10) {
    try {
      await this.createProcessingJobTable();
      
      const limitInt = parseInt(limit) || 10;
      
      const query = 'SELECT * FROM processing_jobs ORDER BY created_at DESC LIMIT ' + limitInt;
      const [rows] = await this.pool.execute(query);
      return rows;
    } catch (error) {
      console.error('Error fetching recent jobs:', error);
      return [];
    }
  }

  async updateGameThumbnail(gameId, thumbnailPath) {
    try {
      const query = 'UPDATE games SET thumbnail = ? WHERE id = ?';
      await this.pool.execute(query, [thumbnailPath, gameId]);
    } catch (error) {
      console.error('Error updating game thumbnail:', error);
      throw error;
    }
  }


  async testConnection() {
    try {
      const [rows] = await this.pool.execute('SELECT 1 as test');
      return rows[0].test === 1;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  async close() {
    try {
      await this.pool.end();
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }
}

module.exports = new DatabaseService();