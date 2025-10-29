class PaymentProcessorClient {
    constructor() {
        this.socket = null;
        this.currentJob = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.statusPollingInterval = null;
        this.user = null;
        this.socketAuthenticated = false;
        this.initialized = false;
        this.schedulerEnabled = false;
        this.lastStatusUpdate = 0;
        
        this.basePath = window.BASE_PATH || '';
        
        this.init();
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        
        this.loadCurrentUser()
            .then(() => {
                this.initializeSocket();
                this.setupEventHandlers();
                this.startStatusPolling();
                this.loadInitialData();
                
                if (window.showMainContent) {
                    window.showMainContent();
                }
            })
            .catch((error) => {
                this.log('Failed to load user info: ' + error.message, 'error');
                setTimeout(() => {
                    window.location.href = this.basePath + '/login';
                }, 2000);
            });
    }

    async loadCurrentUser() {
        try {
            const response = await fetch(this.basePath + '/auth-check');
            
            if (!response.ok) {
                throw new Error('Authentication check failed');
            }
            
            const data = await response.json();

            if (data.authenticated && data.user) {
                this.user = data.user;
                this.updateUserInterface();
                this.log(`Authenticated as: ${this.user.username}`, 'success');
            } else {
                throw new Error('Not authenticated');
            }
        } catch (error) {
            throw error;
        }
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    initializeSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.socket = io({
            path: this.basePath + '/socket.io/',
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
            this.reconnectAttempts = 0;
            this.log('Connected to server', 'success');
            this.authenticateSocket();
        });

        this.socket.on('authRequired', () => {
            this.log('Socket authentication required', 'info');
            this.authenticateSocket();
        });

        this.socket.on('authenticated', (data) => {
            if (data.success) {
                this.socketAuthenticated = true;
                this.log('Socket authenticated successfully', 'success');
                this.loadInitialData();
            } else {
                this.log('Socket authentication failed: ' + (data.error || 'Unknown error'), 'warn');
                this.socketAuthenticated = false;
            }
        });

        this.socket.on('disconnect', (reason) => {
            this.updateConnectionStatus(false);
            this.socketAuthenticated = false;
            this.log('Disconnected from server: ' + reason, 'warn');
        });

        this.socket.on('connect_error', (error) => {
            this.reconnectAttempts++;
            this.log(`Socket connection error (${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${error.message}`, 'warn');
        });

        this.socket.on('schedulerStatus', (status) => {
            if (this.socketAuthenticated) {
                this.updateSchedulerStatus(status);
            }
        });

        this.socket.on('schedulerStarted', (data) => {
            this.log(`Scheduler started - Every ${data.intervalHours} hours`, 'success');
            this.schedulerEnabled = true;
            this.updateSchedulerEnabled(true);
            this.updateNextRun(data.nextRun);
            this.updateUpcomingSchedules(data.upcomingSchedules);
            this.updateButtonStates();
        });

        this.socket.on('schedulerStopped', () => {
            this.log('Scheduler stopped', 'warn');
            this.schedulerEnabled = false;
            this.updateSchedulerEnabled(false);
            this.updateNextRun(null);
            this.updateUpcomingSchedules([]);
            this.updateButtonStates();
        });

        this.socket.on('allJobsStopped', () => {
            this.log('All jobs stopped', 'warn');
            this.hideJobProgress();
            this.currentJob = null;
            this.schedulerEnabled = false;
            this.updateSchedulerEnabled(false);
            this.updateButtonStates();
            this.loadJobHistory();
        });

        this.socket.on('jobStarted', (data) => {
            this.log(`${data.isScheduled ? 'Scheduled' : 'Manual'} job started: ${data.jobId.substring(0, 8)} (${data.totalClients} clients)`, 'info');
            this.currentJob = data;
            this.showJobProgress(data);
        });

        this.socket.on('batchStarted', (data) => {
            this.log(`Processing batch ${data.batchIndex}/${data.totalBatches} (${data.batchSize} clients)`, 'info');
        });

        this.socket.on('batchCompleted', (data) => {
            this.updateJobProgress(data);
            
            if (data.batchIndex % 2 === 0 || data.batchIndex === data.totalBatches) {
                this.log(`Batch ${data.batchIndex}/${data.totalBatches} completed - Success: ${data.successfulInBatch}, Failed: ${data.failedInBatch}`, 'info');
            }
        });

        this.socket.on('jobCompleted', (data) => {
            const jobType = data.isScheduled ? 'Scheduled' : 'Manual';
            this.log(`${jobType} job completed: ${data.jobId.substring(0, 8)} - Success: ${data.stats.successful}, Failed: ${data.stats.failed}`, 'success');
            
            setTimeout(() => {
                this.hideJobProgress();
                this.currentJob = null;
                this.loadJobHistory();
            }, 3000);
        });

        this.socket.on('jobFailed', (data) => {
            const jobType = data.isScheduled ? 'Scheduled' : 'Manual';
            this.log(`${jobType} job failed: ${data.error}`, 'error');
            this.hideJobProgress();
            this.currentJob = null;
            this.loadJobHistory();
        });

        this.socket.on('jobSkipped', (data) => {
            this.log(`Scheduled job skipped: ${data.reason}`, 'warn');
        });

        this.socket.on('settingsUpdated', (settings) => {
            this.updateFormValues(settings);
            this.log('Scheduler settings updated', 'info');
        });
    }

    authenticateSocket() {
        const sessionId = this.getCookie('sessionId');
        if (sessionId) {
            this.socket.emit('authenticate', { sessionId });
        } else {
            this.log('No session cookie found for socket authentication', 'warn');
            this.socketAuthenticated = false;
        }
    }

    updateUserInterface() {
        if (this.user) {
            const userName = document.getElementById('userName');
            const displayName = this.user.firstName && this.user.lastName 
                ? `${this.user.firstName} ${this.user.lastName}`
                : this.user.username;
            userName.textContent = displayName;

            this.updatePermissionBasedUI();
        }
    }

    updatePermissionBasedUI() {
        const hasStaffPermission = this.user.isStaff || this.user.isSuperuser;
        const permissionWarning = document.getElementById('permissionWarning');
        const controlButtons = ['startScheduler', 'stopScheduler', 'runManual', 'stopAllJobs'];
        const formInputs = ['intervalHours', 'batchSize', 'includeInactive'];

        if (!hasStaffPermission) {
            permissionWarning.style.display = 'block';
            
            controlButtons.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.disabled = true;
                    element.title = 'Staff permissions required';
                }
            });

            formInputs.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.disabled = true;
                }
            });
        } else {
            permissionWarning.style.display = 'none';
        }
    }

    setupEventHandlers() {
        document.getElementById('startScheduler').addEventListener('click', () => {
            this.startScheduler();
        });

        document.getElementById('stopScheduler').addEventListener('click', () => {
            this.stopScheduler();
        });

        document.getElementById('runManual').addEventListener('click', () => {
            this.runManualJob();
        });

        document.getElementById('stopAllJobs').addEventListener('click', () => {
            this.stopAllJobs();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    async logout() {
        try {
            await fetch(this.basePath + '/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            this.log('Logout error: ' + error.message, 'warn');
        } finally {
            if (this.socket) {
                this.socket.disconnect();
            }
            window.location.href = this.basePath + '/logout';
        }
    }

    startStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }
        
        this.statusPollingInterval = setInterval(() => {
            if (this.socket && this.socket.connected && this.socketAuthenticated) {
                this.loadSchedulerStatus();
            }
        }, 5000);
    }

    async makeAuthenticatedRequest(url, options = {}) {
        try {
            const response = await fetch(this.basePath + url, options);
            
            if (response.status === 401) {
                this.log('Session expired, please refresh page', 'warn');
                return null;
            }
            
            return response;
        } catch (error) {
            this.log('Network error: ' + error.message, 'error');
            throw error;
        }
    }

    async loadInitialData() {
        try {
            await this.loadSchedulerStatus();
            await this.loadJobHistory();
        } catch (error) {
            this.log('Failed to load initial data: ' + error.message, 'error');
        }
    }

    async loadSchedulerStatus() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/scheduler/status');
            if (!response) return;
            
            const data = await response.json();
            
            if (data.success) {
                this.updateSchedulerStatus(data.status);
                this.updateClientStats(data.clientStats);
                this.lastStatusUpdate = Date.now();
            } else {
                this.log('Failed to load scheduler status: ' + (data.error || 'Unknown error'), 'warn');
            }
        } catch (error) {
            this.log('Failed to connect to API: ' + error.message, 'error');
        }
    }

    async loadJobHistory() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/jobs/history?limit=10');
            if (!response) return;
            
            const data = await response.json();
            
            if (data.success) {
                this.updateJobHistory(data.jobs);
            } else {
                this.updateJobHistory([]);
                this.log('Failed to load job history: ' + (data.error || 'Unknown error'), 'warn');
            }
        } catch (error) {
            this.updateJobHistory([]);
            this.log('Failed to load job history: ' + error.message, 'error');
        }
    }

    async startScheduler() {
        if (!this.user.isStaff && !this.user.isSuperuser) {
            this.log('Insufficient permissions to start scheduler', 'error');
            return;
        }

        const settings = this.getFormSettings();
        
        if (settings.intervalHours < 1 || settings.intervalHours > 12) {
            this.log('Interval hours must be between 1 and 12', 'error');
            return;
        }
        
        if (settings.batchSize < 5 || settings.batchSize > 100) {
            this.log('Batch size must be between 5 and 100', 'error');
            return;
        }
        
        this.setButtonsLoading(true);
        
        try {
            const response = await this.makeAuthenticatedRequest('/api/scheduler/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            
            if (!response) return;
            const data = await response.json();
            
            if (data.success) {
                this.log('Scheduler started successfully', 'success');
                this.schedulerEnabled = true;
                this.updateSchedulerEnabled(true);
                this.updateNextRun(data.nextRun);
                this.updateUpcomingSchedules(data.upcomingSchedules);
                this.updateButtonStates();
            } else {
                this.log(`Failed to start scheduler: ${data.error}`, 'error');
            }
        } catch (error) {
            this.log('Failed to start scheduler: ' + error.message, 'error');
        } finally {
            this.setButtonsLoading(false);
        }
    }

    async stopScheduler() {
        if (!this.user.isStaff && !this.user.isSuperuser) {
            this.log('Insufficient permissions to stop scheduler', 'error');
            return;
        }

        this.setButtonsLoading(true);
        
        try {
            const response = await this.makeAuthenticatedRequest('/api/scheduler/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response) return;
            const data = await response.json();
            
            if (data.success) {
                this.log('Scheduler stopped successfully', 'success');
                this.schedulerEnabled = false;
                this.updateSchedulerEnabled(false);
                this.updateNextRun(null);
                this.updateUpcomingSchedules([]);
                this.updateButtonStates();
            } else {
                this.log(`Failed to stop scheduler: ${data.error}`, 'error');
            }
        } catch (error) {
            this.log('Failed to stop scheduler: ' + error.message, 'error');
        } finally {
            this.setButtonsLoading(false);
        }
    }

    async stopAllJobs() {
        if (!this.user.isStaff && !this.user.isSuperuser) {
            this.log('Insufficient permissions to stop jobs', 'error');
            return;
        }

        if (!confirm('Are you sure you want to stop all running jobs and the scheduler?')) {
            return;
        }
        
        this.setButtonsLoading(true);
        
        try {
            const response = await this.makeAuthenticatedRequest('/api/jobs/stop-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response) return;
            const data = await response.json();
            
            if (data.success) {
                this.log('All jobs stopped successfully', 'success');
                this.schedulerEnabled = false;
                this.updateSchedulerEnabled(false);
                this.updateNextRun(null);
                this.updateUpcomingSchedules([]);
                this.hideJobProgress();
                this.currentJob = null;
                this.updateButtonStates();
            } else {
                this.log(`Failed to stop all jobs: ${data.error}`, 'error');
            }
        } catch (error) {
            this.log('Failed to stop all jobs: ' + error.message, 'error');
        } finally {
            this.setButtonsLoading(false);
        }
    }

    async runManualJob() {
        if (!this.user.isStaff && !this.user.isSuperuser) {
            this.log('Insufficient permissions to run manual job', 'error');
            return;
        }

        const settings = this.getFormSettings();
        
        if (settings.batchSize < 5 || settings.batchSize > 100) {
            this.log('Batch size must be between 5 and 100', 'error');
            return;
        }
        
        this.setButtonsLoading(true);
        
        try {
            const response = await this.makeAuthenticatedRequest('/api/jobs/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            
            if (!response) return;
            const data = await response.json();
            
            if (data.success) {
                this.log('Manual job started successfully', 'success');
            } else {
                this.log(`Failed to start manual job: ${data.error}`, 'error');
            }
        } catch (error) {
            this.log('Failed to start manual job: ' + error.message, 'error');
        } finally {
            this.setButtonsLoading(false);
        }
    }

    getFormSettings() {
        return {
            intervalHours: parseInt(document.getElementById('intervalHours').value),
            batchSize: parseInt(document.getElementById('batchSize').value),
            includeInactive: document.getElementById('includeInactive').checked
        };
    }

    updateFormValues(settings) {
        document.getElementById('intervalHours').value = settings.intervalHours;
        document.getElementById('batchSize').value = settings.batchSize;
        document.getElementById('includeInactive').checked = settings.includeInactive;
    }

    updateButtonStates() {
        const hasPermission = this.user && (this.user.isStaff || this.user.isSuperuser);
        
        if (!hasPermission) {
            return;
        }

        const startBtn = document.getElementById('startScheduler');
        const stopBtn = document.getElementById('stopScheduler');
        
        if (this.schedulerEnabled) {
            startBtn.disabled = true;
            startBtn.style.opacity = '0.6';
            startBtn.style.cursor = 'not-allowed';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';
            stopBtn.style.cursor = 'pointer';
        } else {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.6';
            stopBtn.style.cursor = 'not-allowed';
        }
    }

    setButtonsLoading(loading) {
        const buttons = ['startScheduler', 'stopScheduler', 'runManual', 'stopAllJobs'];
        buttons.forEach(id => {
            const button = document.getElementById(id);
            if (button && !button.disabled) {
                button.disabled = loading;
            }
        });
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connectionStatus');
        if (connected && this.socketAuthenticated) {
            statusDot.className = 'status-dot online';
        } else {
            statusDot.className = 'status-dot offline';
        }
    }

    updateSchedulerStatus(status) {
        this.schedulerEnabled = status.enabled;
        this.updateSchedulerEnabled(status.enabled);
        this.updateNextRun(status.nextRun);
        this.updateUpcomingSchedules(status.upcomingSchedules);
        this.updateButtonStates();
        
        if (status.settings) {
            this.updateFormValues(status.settings);
        }
        
        if (status.currentJob && status.currentJob.status === 'running') {
            this.currentJob = status.currentJob;
            this.showJobProgress(status.currentJob);
        } else if (!this.currentJob) {
            this.hideJobProgress();
        }
    }

    updateSchedulerEnabled(enabled) {
        const statusElement = document.getElementById('schedulerEnabled');
        statusElement.textContent = enabled ? 'Running' : 'Stopped';
        statusElement.style.color = enabled ? '#28a745' : '#dc3545';
        
        this.schedulerEnabled = enabled;
        this.updateButtonStates();
    }

    updateNextRun(nextRun) {
        const nextRunElement = document.getElementById('nextRun');
        if (nextRun) {
            const date = new Date(nextRun);
            nextRunElement.textContent = date.toLocaleString();
        } else {
            nextRunElement.textContent = '-';
        }
    }

    updateUpcomingSchedules(schedules) {
        const container = document.getElementById('upcomingSchedules');
        
        if (!schedules || schedules.length === 0) {
            container.innerHTML = '<div class="no-schedules">No scheduled runs</div>';
            return;
        }
        
        const schedulesHtml = schedules.map((schedule, index) => {
            const date = new Date(schedule);
            const now = new Date();
            const isNext = index === 0;
            const isPast = date < now;
            
            const timeDiff = date - now;
            const hoursRemaining = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutesRemaining = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeRemainingText = '';
            if (timeDiff > 0) {
                if (hoursRemaining > 0) {
                    timeRemainingText = `in ${hoursRemaining}h ${minutesRemaining}m`;
                } else if (minutesRemaining > 0) {
                    timeRemainingText = `in ${minutesRemaining}m`;
                } else {
                    timeRemainingText = 'starting soon';
                }
            } else {
                timeRemainingText = 'overdue';
            }
            
            return `
                <div class="schedule-item ${isNext ? 'next-schedule' : ''} ${isPast ? 'past-schedule' : ''}">
                    <div class="schedule-time">
                        <div class="schedule-date">${date.toLocaleDateString()}</div>
                        <div class="schedule-clock">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div class="schedule-info">
                        <div class="schedule-label">${isNext ? 'Next Run' : `Run #${index + 1}`}</div>
                        <div class="schedule-countdown">${timeRemainingText}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = schedulesHtml;
    }

    updateClientStats(stats) {
        document.getElementById('totalClients').textContent = stats.total.toLocaleString();
        document.getElementById('activeClients').textContent = stats.active.toLocaleString();
        document.getElementById('inactiveClients').textContent = stats.inactive.toLocaleString();
    }

    showJobProgress(job) {
        document.getElementById('noActiveJob').style.display = 'none';
        document.getElementById('jobDetails').style.display = 'block';
        
        document.getElementById('currentJobId').textContent = job.jobId.substring(0, 8);
        document.getElementById('jobType').textContent = job.isScheduled ? 'Scheduled' : 'Manual';
        
        this.resetProgress();
        this.log(`Job progress displayed for ${job.jobId.substring(0, 8)}`, 'info');
    }

    hideJobProgress() {
        document.getElementById('noActiveJob').style.display = 'block';
        document.getElementById('jobDetails').style.display = 'none';
    }

    updateJobProgress(data) {
        if (!this.currentJob) {
            return;
        }
        
        const totalBatches = data.totalBatches;
        const batchPercentage = Math.min((data.batchIndex / totalBatches) * 100, 100);
        
        const estimatedClients = Math.min(data.batchIndex * data.batchSize, this.currentJob.totalClients);
        const totalClients = this.currentJob.totalClients;
        const clientPercentage = Math.min((estimatedClients / totalClients) * 100, 100);
        
        document.getElementById('batchProgress').style.width = `${batchPercentage}%`;
        document.getElementById('batchText').textContent = `${data.batchIndex}/${totalBatches} batches`;
        
        document.getElementById('clientProgress').style.width = `${clientPercentage}%`;
        document.getElementById('clientText').textContent = `${estimatedClients}/${totalClients} clients`;
        
        if (data.successfulInBatch !== undefined && data.failedInBatch !== undefined) {
            const currentSuccess = parseInt(document.getElementById('successCount').textContent) + data.successfulInBatch;
            const currentFailed = parseInt(document.getElementById('failedCount').textContent) + data.failedInBatch;
            
            document.getElementById('successCount').textContent = currentSuccess;
            document.getElementById('failedCount').textContent = currentFailed;
        }
    }

    resetProgress() {
        document.getElementById('batchProgress').style.width = '0%';
        document.getElementById('clientProgress').style.width = '0%';
        document.getElementById('batchText').textContent = '0/0 batches';
        document.getElementById('clientText').textContent = '0/0 clients';
        document.getElementById('successCount').textContent = '0';
        document.getElementById('failedCount').textContent = '0';
        document.getElementById('requestRate').textContent = '0';
    }

    updateJobHistory(jobs) {
        const historyContainer = document.getElementById('jobHistory');
        
        if (jobs.length === 0) {
            historyContainer.innerHTML = '<div class="loading">No jobs found</div>';
            return;
        }
        
        const jobsHtml = jobs.map(job => {
            const startTime = new Date(job.created_at).toLocaleString();
            const duration = job.completed_at && job.started_at ? 
                Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000) : 
                '-';
            
            const successRate = job.total_clients > 0 ? 
                Math.round((job.successful_requests / job.total_clients) * 100) : 0;
            
            return `
                <div class="job-item">
                    <div class="job-info">
                        <div class="job-id">${job.job_id.substring(0, 8)}</div>
                        <div class="job-stats">
                            ${job.total_clients} clients | 
                            Success: ${job.successful_requests} (${successRate}%) | 
                            Failed: ${job.failed_requests} |
                            Duration: ${duration}s
                        </div>
                        <div style="font-size: 0.8rem; color: #6c757d;">${startTime}</div>
                    </div>
                    <div class="job-status ${job.status}">${job.status}</div>
                </div>
            `;
        }).join('');
        
        historyContainer.innerHTML = jobsHtml;
    }

    log(message, type = 'info') {
        const logsContainer = document.getElementById('logs');
        if (!logsContainer) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        
        if (logsContainer.children.length > 100) {
            logsContainer.removeChild(logsContainer.firstChild);
        }
    }

    destroy() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

if (!window.paymentProcessorInstance) {
    document.addEventListener('DOMContentLoaded', () => {
        window.paymentProcessorInstance = new PaymentProcessorClient();
    });
}