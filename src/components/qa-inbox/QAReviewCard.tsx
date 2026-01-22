import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Copy,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { QAInboxItem } from "@/hooks/use-qa-inbox";
import type { ScriptContent, QAResult } from "@/types/script-types";

interface QAReviewCardProps {
  item: QAInboxItem;
  isHardBlock: boolean;
  onRegenerate: () => void;
  onOverride: (reason: string) => void;
  isRegenerating?: boolean;
  isOverriding?: boolean;
}

export function QAReviewCard({
  item,
  isHardBlock,
  onRegenerate,
  onOverride,
  isRegenerating,
  isOverriding,
}: QAReviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const content = item.script_content as unknown as ScriptContent | null;
  const qaResults = item.qa_results as unknown as QAResult | null;
  const vertical = item.account_vertical || 'unknown';

  const handleCopyId = () => {
    navigator.clipboard.writeText(item.id);
    toast.success('Script ID copied');
  };

  const handleOverrideSubmit = () => {
    if (!overrideReason.trim()) {
      toast.error('Override reason is required');
      return;
    }
    onOverride(overrideReason);
    setShowOverrideDialog(false);
    setOverrideReason('');
  };

  return (
    <>
      <Card className={cn(
        "glass-card overflow-hidden transition-all",
        isHardBlock 
          ? "border-destructive/50 bg-destructive/5" 
          : "border-warning/50 bg-warning/5"
      )}>
        {/* Collapsed Header */}
        <div
          className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Top row: status + meta */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <XCircle className={cn(
                  "w-5 h-5 shrink-0",
                  isHardBlock ? "text-destructive" : "text-warning"
                )} />
                <Badge variant="outline" className="text-xs">
                  {item.account_id}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {vertical}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>

              {/* Hook preview */}
              <p className="text-sm mb-2 line-clamp-1">
                <span className="text-muted-foreground">Hook:</span>{" "}
                <span className="font-medium">{content?.hook || 'No hook'}</span>
              </p>

              {/* Failure reason */}
              {item.qa_failed_reason && (
                <p className="text-sm text-destructive/80 mb-2 line-clamp-1">
                  {item.qa_failed_reason}
                </p>
              )}

              {/* Flags */}
              <div className="flex flex-wrap gap-1.5">
                {item.hard_block_flags?.slice(0, 2).map((flag, i) => (
                  <Badge
                    key={`hard-${i}`}
                    variant="outline"
                    className="text-xs text-destructive border-destructive/50"
                  >
                    🚫 {flag}
                  </Badge>
                ))}
                {item.safety_flags?.slice(0, 2).map((flag, i) => (
                  <Badge
                    key={`safety-${i}`}
                    variant="outline"
                    className="text-xs text-warning border-warning/50"
                  >
                    ⚠️ {flag}
                  </Badge>
                ))}
                {((item.hard_block_flags?.length || 0) + (item.safety_flags?.length || 0)) > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{(item.hard_block_flags?.length || 0) + (item.safety_flags?.length || 0) - 4} more
                  </Badge>
                )}
              </div>
            </div>

            {/* Chevron */}
            <div className="shrink-0">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-border/50 p-4 space-y-4">
            {/* Request ID */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>ID: {item.id.slice(0, 8)}...</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={handleCopyId}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>

            {/* QA Errors */}
            {qaResults?.errors && qaResults.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10">
                <h4 className="text-sm font-semibold text-destructive mb-2">
                  QA Errors
                </h4>
                <ul className="text-sm space-y-1">
                  {qaResults.errors.map((error, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* QA Checks Grid */}
            {qaResults?.checks && (
              <div>
                <h4 className="text-sm font-semibold mb-2">QA Checks</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {Object.entries(qaResults.checks).map(([key, passed]) => (
                    <div key={key} className="flex items-center gap-2">
                      {passed ? (
                        <CheckCircle className="w-3 h-3 text-success" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive" />
                      )}
                      <span className="text-muted-foreground">
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voiceover Preview */}
            {content?.voiceover && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Voiceover</h4>
                <p className="text-sm text-muted-foreground bg-secondary/20 p-3 rounded-lg">
                  {content.voiceover}
                </p>
              </div>
            )}

            {/* CTA */}
            {content?.cta && (
              <div>
                <h4 className="text-sm font-semibold mb-2">CTA</h4>
                <p className="text-sm text-muted-foreground">
                  {content.cta}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <Button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
                Regenerate
              </Button>
              
              {!isHardBlock && (
                <Button
                  variant="outline"
                  onClick={() => setShowOverrideDialog(true)}
                  disabled={isOverriding}
                  className="gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Approve Override
                </Button>
              )}
              
              {isHardBlock && (
                <span className="text-xs text-destructive self-center ml-2">
                  Hard blocks cannot be overridden
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override QA Failure</DialogTitle>
            <DialogDescription>
              This will mark the script as QA passed. Please provide a reason for the override.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter override reason..."
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleOverrideSubmit} disabled={isOverriding}>
              {isOverriding ? 'Processing...' : 'Confirm Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
