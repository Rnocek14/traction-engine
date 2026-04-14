import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Lightbulb, Loader2, Download, Play, Plus, Send } from "lucide-react";
import type { PostSlot as PostSlotType } from "@/hooks/use-today-feed";

const STATUS_CONFIG = {
  idea: { label: "Idea", icon: Lightbulb, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  generating: { label: "Generating", icon: Loader2, color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  ready: { label: "Ready", icon: CheckCircle, color: "bg-green-500/10 text-green-600 border-green-500/30" },
  approved: { label: "Approved", icon: Send, color: "bg-primary/10 text-primary border-primary/30" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive/10 text-destructive border-destructive/30" },
};

interface PostSlotProps {
  slot: PostSlotType;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onProduce?: (ideaId: string) => void;
  onClick?: (slot: PostSlotType) => void;
}

export function PostSlotCard({ slot, onApprove, onReject, onProduce, onClick }: PostSlotProps) {
  const config = STATUS_CONFIG[slot.status];
  const Icon = config.icon;

  return (
    <Card className="min-w-[180px] flex-1 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onClick?.(slot)}>
      <CardContent className="p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div onClick={() => onClick?.(slot)} className="cursor-pointer space-y-2">
        <Badge variant="outline" className={`text-[10px] ${config.color}`}>
          <Icon className={`w-3 h-3 mr-1 ${slot.status === "generating" ? "animate-spin" : ""}`} />
          {config.label}
        </Badge>

        <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">
          {slot.title || "Untitled"}
        </p>

        <p className="text-[10px] text-muted-foreground">{slot.contentType}</p>

        <div className="flex gap-1.5 pt-1">
          {slot.status === "ready" && (
            <>
              <Button size="sm" className="h-7 text-xs flex-1" onClick={() => onApprove?.(slot.storyJobId!)}>
                <CheckCircle className="w-3 h-3 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onReject?.(slot.storyJobId!)}>
                <XCircle className="w-3 h-3" />
              </Button>
              {slot.assembledVideoUrl && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                  <a href={slot.assembledVideoUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="w-3 h-3" />
                  </a>
                </Button>
              )}
            </>
          )}
          {slot.status === "idea" && (
            <Button size="sm" variant="secondary" className="h-7 text-xs flex-1" onClick={() => onProduce?.(slot.ideaId!)}>
              <Play className="w-3 h-3 mr-1" /> Produce
            </Button>
          )}
          {slot.status === "approved" && slot.assembledVideoUrl && (
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild>
              <a href={slot.assembledVideoUrl} target="_blank" rel="noopener noreferrer">
                <Download className="w-3 h-3 mr-1" /> Download
              </a>
            </Button>
          )}
          {slot.status === "generating" && (
            <p className="text-[10px] text-muted-foreground italic">Processing…</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptySlot({ onGenerate }: { onGenerate?: () => void }) {
  return (
    <Card className="min-w-[180px] flex-1 border-dashed">
      <CardContent className="p-3 flex flex-col items-center justify-center min-h-[120px] text-muted-foreground">
        <Plus className="w-5 h-5 mb-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onGenerate}>
          Generate Idea
        </Button>
      </CardContent>
    </Card>
  );
}
