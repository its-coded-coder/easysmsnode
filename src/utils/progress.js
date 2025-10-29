class ProgressTracker {
  constructor() {
    this.activeJobs = new Map();
  }

  createProgressBar(current, total, width = 30) {
    const percentage = Math.round((current / total) * 100);
    const completed = Math.round((current / total) * width);
    const remaining = width - completed;
    
    const bar = '█'.repeat(completed) + '░'.repeat(remaining);
    return `[${bar}] ${percentage}% (${current}/${total})`;
  }

  startJob(jobId, totalClients, totalBatches) {
    this.activeJobs.set(jobId, {
      totalClients,
      totalBatches,
      processedClients: 0,
      completedBatches: 0,
      startTime: Date.now()
    });
  }

  updateBatchProgress(jobId, batchIndex, batchSize) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.completedBatches = batchIndex;
    job.processedClients = Math.min(batchIndex * batchSize, job.totalClients);
    
    this.logProgress(jobId);
  }

  updateClientProgress(jobId, processedClients) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.processedClients = processedClients;
    this.logProgress(jobId);
  }

  logProgress(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const batchProgress = this.createProgressBar(
      job.completedBatches, 
      job.totalBatches
    );
    
    const clientProgress = this.createProgressBar(
      job.processedClients, 
      job.totalClients
    );
    
    const elapsed = Math.round((Date.now() - job.startTime) / 1000);
    
    process.stdout.write('\r\x1b[2K');
    process.stdout.write(
      `Batches: ${batchProgress} | ` +
      `Clients: ${clientProgress} | ` +
      `Elapsed: ${elapsed}s`
    );
  }

  completeJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      process.stdout.write('\n');
      this.activeJobs.delete(jobId);
    }
  }

  getJobProgress(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  getAllActiveJobs() {
    return Array.from(this.activeJobs.entries()).map(([jobId, job]) => ({
      jobId,
      ...job,
      batchPercentage: Math.round((job.completedBatches / job.totalBatches) * 100),
      clientPercentage: Math.round((job.processedClients / job.totalClients) * 100)
    }));
  }
}

module.exports = new ProgressTracker();