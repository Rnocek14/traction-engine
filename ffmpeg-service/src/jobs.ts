export type JobStatus = "queued" | "rendering" | "succeeded" | "failed";

export interface Job {
  job_id: string;
  idempotency_key?: string;
  status: JobStatus;
  progress?: number;
  eta_seconds?: number;
  output_url?: string;
  duration?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

const jobs = new Map<string, Job>();
const idempotencyIndex = new Map<string, string>();

export function getJob(job_id: string): Job | undefined {
  return jobs.get(job_id);
}

export function getJobByIdempotencyKey(key: string): Job | undefined {
  const jobId = idempotencyIndex.get(key);
  return jobId ? jobs.get(jobId) : undefined;
}

export function upsertJob(job: Job, idempotencyKey?: string): void {
  if (idempotencyKey) {
    job.idempotency_key = idempotencyKey;
    idempotencyIndex.set(idempotencyKey, job.job_id);
  }
  jobs.set(job.job_id, job);
}

export function setJobStatus(job_id: string, patch: Partial<Job>): void {
  const cur = jobs.get(job_id) || { job_id, status: "queued" as const };
  jobs.set(job_id, { ...cur, ...patch });
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();

  for (const [id, job] of jobs) {
    const completed = job.completed_at ? new Date(job.completed_at).getTime() : 0;
    if (completed && now - completed > maxAgeMs) {
      jobs.delete(id);
      if (job.idempotency_key) {
        idempotencyIndex.delete(job.idempotency_key);
      }
    }
  }
}
