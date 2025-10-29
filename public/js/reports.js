class ReportsManager {
    constructor() {
        this.currentTimeRange = 'daily';
        this.charts = {};
        this.socket = null;
        this.basePath = window.BASE_PATH || '';
        this.updateInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSocket();
        this.loadInitialData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTimeRange = e.target.dataset.range;
                this.loadInitialData();
            });
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportSuccessfulPayments();
        });
    }

    initializeSocket() {
        this.socket = io({
            path: this.basePath + '/socket.io/',
            autoConnect: true
        });

        this.socket.on('connect', () => {
            console.log('Connected to real-time updates');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from real-time updates');
        });

        this.socket.on('jobCompleted', () => {
            setTimeout(() => {
                this.loadInitialData();
            }, 2000);
        });

        this.socket.on('reportsUpdate', (data) => {
            if (data.type === 'jobCompleted') {
                setTimeout(() => {
                    this.loadInitialData();
                }, 2000);
            }
        });
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadTodayMetrics(),
                this.loadDashboardMetrics(),
                this.loadDailyRevenue(),
                this.loadHourlyRevenue(),
                this.loadPaymentAnalytics()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadTodayMetrics() {
        try {
            const [todayResponse, comparisonResponse] = await Promise.all([
                fetch(`${this.basePath}/api/reports/today`),
                fetch(`${this.basePath}/api/reports/revenue-comparison`)
            ]);
            
            const todayData = await todayResponse.json();
            const comparisonData = await comparisonResponse.json();
            
            if (todayData.success && comparisonData.success) {
                this.renderTodayMetrics(todayData.data, comparisonData.data);
            }
        } catch (error) {
            console.error('Error loading today metrics:', error);
        }
    }

    async loadDashboardMetrics() {
        try {
            const response = await fetch(`${this.basePath}/api/reports/dashboard?timeRange=${this.currentTimeRange}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderMetrics(data.data);
            }
        } catch (error) {
            console.error('Error loading dashboard metrics:', error);
        }
    }

    async loadDailyRevenue() {
        try {
            const response = await fetch(`${this.basePath}/api/reports/daily-revenue?timeRange=${this.currentTimeRange}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderRevenueChart(data.data);
                this.renderUsersChart(data.data);
            }
        } catch (error) {
            console.error('Error loading daily revenue:', error);
        }
    }

    async loadHourlyRevenue() {
        try {
            const response = await fetch(`${this.basePath}/api/reports/hourly-revenue`);
            const data = await response.json();
            
            if (data.success) {
                this.renderHourlyChart(data.data);
            }
        } catch (error) {
            console.error('Error loading hourly revenue:', error);
        }
    }

    async loadPaymentAnalytics() {
        try {
            const response = await fetch(`${this.basePath}/api/reports/payment-analytics?timeRange=${this.currentTimeRange}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatusChart(data.data.statusBreakdown);
                this.renderOfferTable(data.data.offerPerformance);
                this.renderFailureTable(data.data.failureReasons);
            }
        } catch (error) {
            console.error('Error loading payment analytics:', error);
        }
    }

    renderTodayMetrics(todayData, comparisonData) {
        const todayGrid = document.querySelector('.today-grid');
        
        const revenueChange = comparisonData.changes.revenue;
        const usersChange = comparisonData.changes.users;
        
        todayGrid.innerHTML = `
            <div class="today-metric">
                <div class="today-value">KES ${todayData.todayRevenue.toLocaleString()}</div>
                <div class="today-label">Today's Revenue</div>
                <div class="comparison-indicator ${revenueChange >= 0 ? 'comparison-up' : 'comparison-down'}">
                    ${revenueChange >= 0 ? '↑' : '↓'} ${Math.abs(revenueChange)}% vs yesterday
                </div>
            </div>
            <div class="today-metric">
                <div class="today-value">${todayData.successfulUsers.toLocaleString()}</div>
                <div class="today-label">Successful Users</div>
                <div class="comparison-indicator ${usersChange >= 0 ? 'comparison-up' : 'comparison-down'}">
                    ${usersChange >= 0 ? '↑' : '↓'} ${Math.abs(usersChange)}% vs yesterday
                </div>
            </div>
            <div class="today-metric">
                <div class="today-value">${todayData.successfulPayments.toLocaleString()}</div>
                <div class="today-label">Successful Payments</div>
            </div>
            <div class="today-metric">
                <div class="today-value">${todayData.successRate}%</div>
                <div class="today-label">Success Rate</div>
            </div>
            <div class="today-metric">
                <div class="today-value">KES ${todayData.avgPaymentAmount.toFixed(2)}</div>
                <div class="today-label">Avg Payment</div>
            </div>
        `;
    }

    renderMetrics(data) {
        const metricsGrid = document.getElementById('metricsGrid');
        metricsGrid.innerHTML = `
            <div class="metric-card revenue-highlight">
                <div class="metric-value">KES ${data.summary.totalRevenue.toLocaleString()}</div>
                <div class="metric-label">Total Revenue</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.successfulUsers.toLocaleString()}</div>
                <div class="metric-label">Successful Users</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.successfulPayments.toLocaleString()}</div>
                <div class="metric-label">Successful Payments</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.successRate}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.totalPayments.toLocaleString()}</div>
                <div class="metric-label">Total Payments</div>
            </div>
        `;
    }

    renderRevenueChart(data) {
        const ctx = document.getElementById('revenueChart').getContext('2d');
        
        if (this.charts.revenue) {
            this.charts.revenue.destroy();
        }

        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Revenue (KES)',
                    data: data.map(d => d.dailyRevenue),
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'KES ' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Revenue: KES ' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    renderUsersChart(data) {
        const ctx = document.getElementById('usersChart').getContext('2d');
        
        if (this.charts.users) {
            this.charts.users.destroy();
        }

        this.charts.users = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Successful Users',
                    data: data.map(d => d.successfulUsers),
                    backgroundColor: '#3498db',
                    borderColor: '#2980b9',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderHourlyChart(data) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        
        if (this.charts.hourly) {
            this.charts.hourly.destroy();
        }

        this.charts.hourly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => `${d.hour}:00`),
                datasets: [{
                    label: 'Hourly Revenue (KES)',
                    data: data.map(d => d.hourlyRevenue),
                    backgroundColor: '#f39c12',
                    borderColor: '#e67e22',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'KES ' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Revenue: KES ' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    renderStatusChart(data) {
        const ctx = document.getElementById('statusChart').getContext('2d');
        
        if (this.charts.status) {
            this.charts.status.destroy();
        }

        const colors = ['#27ae60', '#e74c3c', '#f39c12', '#9b59b6', '#34495e'];
        
        this.charts.status = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(d => d.status),
                datasets: [{
                    data: data.map(d => d.count),
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderOfferTable(data) {
        const tableContainer = document.getElementById('offerTable');
        
        if (data.length === 0) {
            tableContainer.innerHTML = '<div class="loading-spinner">No successful payments found</div>';
            return;
        }

        const table = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Offer Code</th>
                        <th>Successful Payments</th>
                        <th>Successful Users</th>
                        <th>Total Revenue</th>
                        <th>Avg Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${row.offerCode}</td>
                            <td>${row.successfulPayments.toLocaleString()}</td>
                            <td>${row.successfulUsers.toLocaleString()}</td>
                            <td>KES ${row.totalRevenue.toLocaleString()}</td>
                            <td>KES ${row.avgAmount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        tableContainer.innerHTML = table;
    }

    renderFailureTable(data) {
        const tableContainer = document.getElementById('failureTable');
        
        if (data.length === 0) {
            tableContainer.innerHTML = '<div class="loading-spinner">No failure data available</div>';
            return;
        }

        const table = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Failure Reason</th>
                        <th>Failure Count</th>
                        <th>Affected Users</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${row.description || 'Unknown'}</td>
                            <td>${row.failureCount.toLocaleString()}</td>
                            <td>${row.affectedUsers.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        tableContainer.innerHTML = table;
    }

    async exportSuccessfulPayments() {
        try {
            const response = await fetch(`${this.basePath}/api/reports/export-successful?timeRange=${this.currentTimeRange}`);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `successful_payments_${this.currentTimeRange}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error exporting successful payments:', error);
        }
    }

    startAutoRefresh() {
        this.updateInterval = setInterval(() => {
            this.loadInitialData();
        }, 5 * 60 * 1000); // Refresh every 5 minutes
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.socket) {
            this.socket.disconnect();
        }
        Object.values(this.charts).forEach(chart => chart.destroy());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.reportsManager = new ReportsManager();
});