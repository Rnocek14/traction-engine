import { useIdeaLineage, type IdeaLineage } from "@/hooks/use-ideas-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Sparkles,
  FileText,
  Music,
  Video,
  Layers,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: <Clock className="w-3 h-3" /> },
  generating: { label: "Generating", color: "bg-primary/10 text-primary", icon: <Sparkles className="w-3 h-3" /> },
  clips_ready: { label: "Clips Ready", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: <Video className="w-3 h-3" /> },
  done: { label: "Done", color: "bg-green-500/10 text-green-700 dark:text-green-400", icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: <XCircle className="w-3 h-3" /> },
};

export function IdeaQueuePanel() {
  const { data: ideas, isLoading } = useIdeaLineage(80);
  const [filter, setFilter] = useState<"all" | "enriched" | "performing">("all");

  const filtered = ideas?.filter(idea => {
    if (filter === "enriched") return idea.enrichment?.used_scraped_insights;
    if (filter === "performing") return idea.outcome_score != null && idea.outcome_score > 0;
    return true;
  }) || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Idea Pipeline</CardTitle>
          <div className="flex gap-1">
            {(["all", "enriched", "performing"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : f === "enriched" ? "🔥 Enriched" : "📊 Performing"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {filter === "all" ? "No stories yet. Create your first in Produce." : `No ${filter} ideas found.`}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {filtered.map(idea => (
              <IdeaRow key={idea.id} idea={idea} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IdeaRow({ idea }: { idea: IdeaLineage }) {
  const [open, setOpen] = useState(false);
  const statusCfg = STATUS_CONFIG[idea.status] || STATUS_CONFIG.draft;

  // Pipeline progress
  const hasScript = !!idea.script_experiment_id;
  const hasClips = (idea.completed_clips || 0) > 0;
  const isAssembled = idea.assembled_status === "done" || idea.assembled_status === "succeeded";
  const isApproved = idea.review_status === "approved";
  const hasPerformance = idea.outcome_score != null && idea.outcome_score > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left">
          {/* Status */}
          <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0", statusCfg.color)}>
            {statusCfg.icon}
            {statusCfg.label}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {idea.title || `Story ${idea.id.slice(0, 8)}`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {idea.account_id} · {idea.story_type} · {new Date(idea.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Pipeline dots */}
          <div className="flex items-center gap-1 shrink-0">
            <PipelineDot active={hasScript} icon={<FileText className="w-3 h-3" />} label="Script" />
            <PipelineDot active={hasClips} icon={<Video className="w-3 h-3" />} label="Clips" />
            <PipelineDot active={isAssembled} icon={<Layers className="w-3 h-3" />} label="Assembly" />
            <PipelineDot active={isApproved} icon={<CheckCircle className="w-3 h-3" />} label="Approved" />
            <PipelineDot active={hasPerformance} icon={<TrendingUp className="w-3 h-3" />} label="Performance" />
          </div>

          {/* Enrichment badge */}
          {idea.enrichment?.used_scraped_insights && (
            <Flame className="w-4 h-4 text-orange-500 shrink-0" />
          )}

          {/* Outcome score */}
          {idea.outcome_score != null && idea.outcome_score > 0 && (
            <Badge variant={idea.outcome_score >= 70 ? "default" : "secondary"} className="text-xs shrink-0">
              {Math.round(idea.outcome_score)}
            </Badge>
          )}

          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 mt-1 mb-2 p-3 rounded-md border bg-muted/30 space-y-3 text-sm">
          {/* Lineage */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <LineageItem label="Topic Exp" value={idea.topic_experiment_id} />
            <LineageItem label="Script Exp" value={idea.script_experiment_id} />
            <LineageItem label="Hook Exp" value={idea.hook_experiment_id} />
            <LineageItem label="Visual Exp" value={idea.visual_experiment_id} />
          </div>

          {/* Production stats */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Clips: {idea.completed_clips || 0}/{idea.total_clips || 0}</span>
            {idea.continuity_score != null && <span>Continuity: {idea.continuity_score}/100</span>}
            <span>Assembly: {idea.assembled_status || "none"}</span>
            <span>Review: {idea.review_status}</span>
          </div>

          {/* Enrichment details */}
          {idea.enrichment?.used_scraped_insights && (
            <div className="space-y-1">
              <p className="text-xs font-medium flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-500" /> Trend Enriched
              </p>
              {idea.enrichment.hook_patterns && idea.enrichment.hook_patterns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.enrichment.hook_patterns.map(h => (
                    <Badge key={h} variant="outline" className="text-[10px]">{h}</Badge>
                  ))}
                </div>
              )}
              {idea.enrichment.emotional_triggers && idea.enrichment.emotional_triggers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.enrichment.emotional_triggers.map(e => (
                    <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Performance */}
          {idea.outcome_score != null && idea.outcome_score > 0 && (
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Outcome Score: {Math.round(idea.outcome_score)}/100</span>
              {idea.outcome_score >= 70 && (
                <Badge className="text-[10px]">🏆 Winner</Badge>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PipelineDot({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <div
      title={label}
      className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
        active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground/40"
      )}
    >
      {icon}
    </div>
  );
}

function LineageItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-mono truncate">{value ? value.slice(0, 8) : "—"}</p>
    </div>
  );
}
