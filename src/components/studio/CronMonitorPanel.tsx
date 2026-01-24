import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Timer,
  Activity,
  Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CronJob {
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_return_message: string | null;
}

interface QueueHealth {
  pending_count: number;
  running_count: number;
  failed_count: number;
  done_count: number;
  oldest_pending_age_seconds: number;
  stale_running_count: number;
}

function CronJobCard({ job }: { job: CronJob }) {
  const isSuccess = job.last_status === "succeeded";
  const isFailed = job.last_status === "failed";
  const isRunning = job.last_status === "running";
  
  const statusColor = isSuccess ? "bg-green-500/10 text-green-500 border-green-500/20" 
    : isFailed ? "bg-red-500/10 text-red-500 border-red-500/20"
    : isRunning ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
    : "bg-muted text-muted-foreground";

  const StatusIcon = isSuccess ? CheckCircle2 
    : isFailed ? XCircle 
    : isRunning ? Loader2
    : Clock;

  const jobLabel = job.jobname === "queue-comparisons-10m" 
    ? "Queue Comparisons" 
    : job.jobname === "process-compare-queue-3m"
    ? "Process Queue"
    : job.jobname;

  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{jobLabel}</CardTitle>
          <Badge variant="outline" className={statusColor}>
            <StatusIcon className={`h-3 w-3 mr-1 ${isRunning ? "animate-spin" : ""}`} />
            {job.last_status || "No runs"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Schedule</span>
          <span className="font-mono text-xs">{job.schedule}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Active</span>
          <Badge variant={job.active ? "default" : "secondary"} className="text-xs">
            {job.active ? "Yes" : "No"}
          </Badge>
        </div>
        {job.last_start && (
          <div className="flex justify-between text-muted-foreground">
            <span>Last Run</span>
            <span>{formatDistanceToNow(new Date(job.last_start), { addSuffix: true })}</span>
          </div>
        )}
        {isFailed && job.last_return_message && (
          <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded text-xs text-red-400 font-mono break-all">
            {job.last_return_message.slice(0, 200)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueHealthCard({ health }: { health: QueueHealth }) {
  const hasStale = health.stale_running_count > 0;
  const oldestAgeMinutes = Math.round(health.oldest_pending_age_seconds / 60);
  const isBacklogged = oldestAgeMinutes > 30;

  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Compare Queue Health
          </CardTitle>
          {hasStale && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Stale runners
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-500">{health.pending_count}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">{health.running_count}</div>
            <div className="text-xs text-muted-foreground">Running</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{health.failed_count}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{health.done_count}</div>
            <div className="text-xs text-muted-foreground">Done</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Oldest Pending
            </span>
            <Badge variant={isBacklogged ? "destructive" : "secondary"}>
              {oldestAgeMinutes > 0 ? `${oldestAgeMinutes}m` : "—"}
            </Badge>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Stale Runners (&gt;15m)
            </span>
            <Badge variant={hasStale ? "destructive" : "secondary"}>
              {health.stale_running_count}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CronMonitorPanel() {
  const { data: cronJobs, isLoading: cronLoading, error: cronError } = useQuery({
    queryKey: ["cron-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cron_status");
      if (error) throw error;
      return data as CronJob[];
    },
    refetchInterval: 60000, // Every minute
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["compare-queue-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_compare_queue_health");
      if (error) throw error;
      return (data as QueueHealth[])?.[0] || null;
    },
    refetchInterval: 30000, // Every 30 seconds
  });

  if (cronLoading || healthLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (cronError) {
    return (
      <Card className="bg-yellow-500/10 border-yellow-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              Cron jobs not scheduled yet. Run the pg_cron SQL in the SQL Editor first.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Queue Health */}
      {health && <QueueHealthCard health={health} />}

      {/* Cron Jobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cronJobs?.map((job) => (
          <CronJobCard key={job.jobname} job={job} />
        ))}
      </div>

      {(!cronJobs || cronJobs.length === 0) && (
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No cron jobs scheduled yet.</p>
            <p className="text-xs mt-1">Run the pg_cron SQL to enable automated comparisons.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
