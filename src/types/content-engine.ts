// ============================================
// Content Engine - Centralized Types
// ============================================

// Stage & Pipeline Types
export type StageStatus = "completed" | "active" | "pending" | "error" | "paused";

export interface PipelineStage {
  id: string;
  label: string;
  status: StageStatus;
  count?: number;
}

export type JobStatus = "processing" | "queued" | "completed" | "failed" | "retrying";

export interface PipelineJob {
  id: string;
  name: string;
  account: string;
  status: JobStatus;
  progress?: number;
  retries: number;
  maxRetries: number;
  startedAt?: string;
  error?: string;
  costCents?: number; // Use cents to avoid float precision issues
}

export interface StageConfig {
  model: string;
  provider: string;
  avgLatency: string;
  costPerUnitCents: number; // Cents, not floats
  successRate: number;
  queueDepth: number;
}

// Account Types
export type AccountStatus = "active" | "paused" | "warmup" | "flagged";
export type Platform = "tiktok" | "instagram";
export type Vertical = "privacy" | "education" | "health";

export interface Account {
  id: string;
  name: string;
  handle: string;
  platform: Platform;
  vertical: Vertical;
  followers: number;
  engagement: number;
  status: AccountStatus;
  videosToday: number;
  trend: number;
  monthlyCostCents: number; // Cents for precision
  monthlyRevenueCents?: number;
}

export interface AccountConfig {
  voiceId: string;
  voiceProvider: string;
  motifSet: string;
  postingSchedule: string;
  warmupMode: boolean;
  autoPublish: boolean;
  maxDailyPosts: number;
}

export interface AccountHealth {
  accountAge: number;
  trustScore: number;
  warningLevel: "none" | "low" | "medium" | "high";
  lastWarning: string | null;
  shadowbanRisk: "low" | "medium" | "high";
  contentDiversity: number;
  engagementConsistency: number;
}

// Cost Types
export interface CostBreakdown {
  llmCents: number;
  ttsCents: number;
  videoCents: number;
  otherCents: number;
}

export interface CostSummary {
  dailySpentCents: number;
  dailyBudgetCents: number;
  breakdown: CostBreakdown;
  weeklySpentCents: number;
  weeklyTrend: number;
  avgPerVideoCents: number;
  perVideoTrend: number;
  roiPercent: number;
  roiStatus: "positive" | "neutral" | "negative";
  topDriver: keyof CostBreakdown;
}

// Utility functions for money formatting
export function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// Calculate ROI safely (returns null if cost is 0)
export function calculateROI(revenueCents: number, costCents: number): number | null {
  if (costCents <= 0) return null;
  return ((revenueCents - costCents) / costCents) * 100;
}

// Get top cost driver from breakdown
export function getTopCostDriver(breakdown: CostBreakdown): { key: keyof CostBreakdown; label: string; cents: number } {
  const drivers: { key: keyof CostBreakdown; label: string; cents: number }[] = [
    { key: "llmCents", label: "LLM", cents: breakdown.llmCents },
    { key: "ttsCents", label: "TTS", cents: breakdown.ttsCents },
    { key: "videoCents", label: "Video", cents: breakdown.videoCents },
    { key: "otherCents", label: "Other", cents: breakdown.otherCents },
  ];
  
  return drivers.reduce((max, driver) => driver.cents > max.cents ? driver : max, drivers[0]);
}
