import { 
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  XCircle,
  Zap,
  DollarSign,
} from "lucide-react";

interface Job {
  id: string;
  name: string;
  account: string;
  status: "processing" | "queued" | "completed" | "failed" | "retrying";
  progress?: number;
  retries: number;
  maxRetries: number;
  startedAt?: string;
  error?: string;
  cost?: number;
}

interface StageConfig {
  model: string;
  provider: string;
  avgLatency: string;
  costPerUnit: string;
  successRate: number;
  queueDepth: number;
}

interface PipelineStageDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: {
    id: string;
    label: string;
    status: "completed" | "active" | "pending" | "error";
    count?: number;
  } | null;
}

// Mock data - would come from real API
const getStageData = (stageId: string): { jobs: Job[]; config: StageConfig } => {
  const configs: Record<string, StageConfig> = {
    script: {
      model: "GPT-4 Turbo",
      provider: "OpenAI",
      avgLatency: "2.3s",
      costPerUnit: "$0.012",
      successRate: 99.2,
      queueDepth: 4,
    },
    voice: {
      model: "Eleven Turbo v2",
      provider: "ElevenLabs",
      avgLatency: "4.1s",
      costPerUnit: "$0.024",
      successRate: 98.7,
      queueDepth: 8,
    },
    video: {
      model: "Sora",
      provider: "OpenAI",
      avgLatency: "45s",
      costPerUnit: "$0.18",
      successRate: 94.5,
      queueDepth: 12,
    },
    assembly: {
      model: "FFmpeg 6.1",
      provider: "Local",
      avgLatency: "8.2s",
      costPerUnit: "$0.001",
      successRate: 99.9,
      queueDepth: 2,
    },
    publish: {
      model: "API v2",
      provider: "TikTok/Instagram",
      avgLatency: "1.8s",
      costPerUnit: "$0.00",
      successRate: 97.3,
      queueDepth: 0,
    },
  };

  const jobs: Record<string, Job[]> = {
    script: [
      { id: "s1", name: "Privacy Tip #47", account: "@FootprintFinder", status: "completed", retries: 0, maxRetries: 3, cost: 0.012 },
      { id: "s2", name: "Resume Red Flag #12", account: "@CareerBoostHQ", status: "completed", retries: 0, maxRetries: 3, cost: 0.011 },
    ],
    voice: [
      { id: "v1", name: "Privacy Tip #47", account: "@FootprintFinder", status: "processing", progress: 67, retries: 0, maxRetries: 3, startedAt: "2m ago" },
      { id: "v2", name: "Data Broker Alert", account: "@PrivacyShield", status: "queued", retries: 0, maxRetries: 3 },
    ],
    video: [
      { id: "vd1", name: "Privacy Tip #45", account: "@FootprintFinder", status: "processing", progress: 34, retries: 0, maxRetries: 3, startedAt: "12m ago", cost: 0.18 },
      { id: "vd2", name: "Interview Script #8", account: "@InterviewAce", status: "processing", progress: 78, retries: 1, maxRetries: 3, startedAt: "8m ago", cost: 0.18 },
      { id: "vd3", name: "Career Tip #22", account: "@CareerBoostHQ", status: "retrying", retries: 2, maxRetries: 3, error: "Generation timeout", cost: 0.36 },
      { id: "vd4", name: "Stroke Recovery #5", account: "@StrokeRecovery", status: "queued", retries: 0, maxRetries: 3 },
    ],
    assembly: [],
    publish: [],
  };

  return {
    jobs: jobs[stageId] || [],
    config: configs[stageId] || configs.script,
  };
};

export function PipelineStageDrawer({ open, onOpenChange, stage }: PipelineStageDrawerProps) {
  if (!stage) return null;

  const { jobs, config } = getStageData(stage.id);
  const activeJobs = jobs.filter(j => j.status === "processing" || j.status === "retrying");
  const queuedJobs = jobs.filter(j => j.status === "queued");
  const failedJobs = jobs.filter(j => j.status === "failed");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="mx-auto w-full max-w-4xl">
          <DrawerHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle className="text-xl flex items-center gap-3">
                  {stage.label}
                  <Badge 
                    variant="outline" 
                    className={cn(
                      stage.status === "active" && "border-primary text-primary",
                      stage.status === "completed" && "border-success text-success",
                      stage.status === "error" && "border-destructive text-destructive",
                      stage.status === "pending" && "border-muted-foreground text-muted-foreground"
                    )}
                  >
                    {stage.status}
                  </Badge>
                </DrawerTitle>
                <DrawerDescription className="mt-1">
                  {stage.count} items in queue • {activeJobs.length} active • {queuedJobs.length} waiting
                </DrawerDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Pause className="w-4 h-4" />
                  Pause Stage
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry Failed
                </Button>
              </div>
            </div>
          </DrawerHeader>

          <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] scrollbar-thin">
            {/* Stage Configuration */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ConfigCard label="Model" value={config.model} icon={<Zap className="w-4 h-4 text-primary" />} />
              <ConfigCard label="Provider" value={config.provider} />
              <ConfigCard label="Avg Latency" value={config.avgLatency} icon={<Clock className="w-4 h-4 text-muted-foreground" />} />
              <ConfigCard label="Cost/Unit" value={config.costPerUnit} icon={<DollarSign className="w-4 h-4 text-warning" />} />
            </div>

            {/* Success Rate Bar */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Success Rate (24h)</span>
                <span className="font-mono text-sm text-success">{config.successRate}%</span>
              </div>
              <Progress value={config.successRate} className="h-2" />
            </div>

            {/* Active Jobs */}
            {activeJobs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Active Jobs ({activeJobs.length})
                </h4>
                <div className="space-y-2">
                  {activeJobs.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Queued Jobs */}
            {queuedJobs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Queued ({queuedJobs.length})
                </h4>
                <div className="space-y-2">
                  {queuedJobs.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {jobs.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No jobs in this stage</p>
                <p className="text-sm">Items will appear here when they reach this pipeline step</p>
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ConfigCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const statusConfig = {
    processing: { icon: Loader2, color: "text-primary", bg: "bg-primary/10", animate: true },
    queued: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", animate: false },
    completed: { icon: CheckCircle, color: "text-success", bg: "bg-success/10", animate: false },
    failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", animate: false },
    retrying: { icon: RefreshCw, color: "text-warning", bg: "bg-warning/10", animate: true },
  };

  const config = statusConfig[job.status];
  const Icon = config.icon;

  return (
    <div className={cn("p-3 rounded-lg border border-border/50", config.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={cn("w-4 h-4", config.color, config.animate && "animate-spin")} />
          <div>
            <p className="font-medium text-sm">{job.name}</p>
            <p className="text-xs text-muted-foreground">{job.account}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {job.retries > 0 && (
            <Badge variant="outline" className="text-warning border-warning/50">
              Retry {job.retries}/{job.maxRetries}
            </Badge>
          )}
          {job.cost && (
            <span className="text-xs font-mono text-muted-foreground">
              ${job.cost.toFixed(3)}
            </span>
          )}
          {job.startedAt && (
            <span className="text-xs text-muted-foreground">{job.startedAt}</span>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <XCircle className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {job.progress !== undefined && (
        <div className="mt-2">
          <Progress value={job.progress} className="h-1.5" />
        </div>
      )}
      {job.error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="w-3 h-3" />
          {job.error}
        </div>
      )}
    </div>
  );
}
