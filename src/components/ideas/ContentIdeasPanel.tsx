import { useContentIdeas, useUpdateIdeaStatus, type ContentIdea } from "@/hooks/use-ideas-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Zap, Heart, Film, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLES: Record<string, string> = {
  proposed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "bg-green-500/10 text-green-700 dark:text-green-400",
  rejected: "bg-destructive/10 text-destructive",
  produced: "bg-primary/10 text-primary",
};

export function ContentIdeasPanel() {
  const [filter, setFilter] = useState<string>("all");
  const { data: ideas, isLoading } = useContentIdeas(filter);
  const updateStatus = useUpdateIdeaStatus();

  const handleApprove = (id: string) => {
    updateStatus.mutate({ id, status: "approved" }, {
      onSuccess: () => toast.success("Idea approved — ready for production"),
    });
  };

  const handleReject = (id: string) => {
    updateStatus.mutate({ id, status: "rejected" }, {
      onSuccess: () => toast.info("Idea rejected"),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Content Ideas</CardTitle>
          <div className="flex gap-1">
            {["all", "proposed", "approved", "produced", "rejected"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !ideas || ideas.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "No ideas yet. Click \"Generate Ideas\" to let AI propose content based on trends."
                : `No ${filter} ideas.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {ideas.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onApprove={() => handleApprove(idea.id)}
                onReject={() => handleReject(idea.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IdeaCard({
  idea,
  onApprove,
  onReject,
}: {
  idea: ContentIdea;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={cn("text-[10px]", STATUS_STYLES[idea.status] || "")}>
              {idea.status}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {idea.opportunity_score}/100
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {idea.generated_by === "auto" ? "🤖 Auto" : "🧠 Manual"}
            </span>
          </div>
          <h4 className="text-sm font-semibold">{idea.title}</h4>
          <p className="text-xs text-muted-foreground">{idea.subject} · {idea.account_id}</p>
        </div>

        {/* Actions */}
        {idea.status === "proposed" && (
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onApprove} className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950">
              <Check className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        {idea.status === "approved" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
            <ArrowRight className="w-3 h-3" /> Produce
          </Button>
        )}
      </div>

      {/* Details */}
      {idea.angle && (
        <p className="text-xs text-muted-foreground italic">{idea.angle}</p>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {idea.suggested_hook_type && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Zap className="w-2.5 h-2.5" /> {idea.suggested_hook_type}
          </Badge>
        )}
        {idea.suggested_format && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Film className="w-2.5 h-2.5" /> {idea.suggested_format}
          </Badge>
        )}
        {idea.emotional_triggers?.map(t => (
          <Badge key={t} variant="outline" className="text-[10px] gap-1">
            <Heart className="w-2.5 h-2.5" /> {t}
          </Badge>
        ))}
      </div>

      {/* Reasoning */}
      {idea.reasoning && (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
          💡 {idea.reasoning}
        </p>
      )}
    </div>
  );
}
