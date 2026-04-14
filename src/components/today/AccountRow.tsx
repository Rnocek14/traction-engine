import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, CheckCircle, Loader2, Lightbulb } from "lucide-react";
import { PostSlotCard, EmptySlot } from "./PostSlot";
import type { AccountFeedItem, PostSlot } from "@/hooks/use-today-feed";

const PLATFORM_SHORT: Record<string, string> = {
  tiktok: "TT",
  instagram: "IG",
  youtube: "YT",
  facebook: "FB",
};

interface AccountRowProps {
  item: AccountFeedItem;
  compact?: boolean;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onProduce?: (ideaId: string) => void;
  onRegenerate?: (jobId: string) => void;
  onGenerateIdeas?: (accountId: string) => void;
  onSlotClick?: (slot: PostSlot) => void;
  producingIds?: Set<string>;
}

export function AccountRow({ item, compact, onApprove, onReject, onProduce, onRegenerate, onGenerateIdeas, onSlotClick, producingIds }: AccountRowProps) {
  if (compact) {
    return (
      <Card>
        <CardContent className="py-2 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="outline" className="text-[10px] shrink-0">
              {PLATFORM_SHORT[item.platform] || item.platform}
            </Badge>
            <span className="text-sm font-medium truncate">{item.accountName || item.handle || item.accountId}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">{item.vertical}</span>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            {item.stats.ready > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3 h-3" /> {item.stats.ready} ready
              </span>
            )}
            {item.stats.generating > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <Loader2 className="w-3 h-3" /> {item.stats.generating} gen
              </span>
            )}
            {item.stats.ideas > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <Lightbulb className="w-3 h-3" /> {item.stats.ideas} ideas
              </span>
            )}
            {item.stats.ready > 0 && (
              <Button size="sm" className="h-6 text-[10px]" onClick={() => {
                const readySlot = item.slots.find(s => s.status === "ready");
                if (readySlot?.storyJobId) onApprove?.(readySlot.storyJobId);
              }}>
                Approve
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxSlots = Math.min(item.maxDailyPosts || 3, 5);
  const emptyCount = Math.max(0, Math.min(maxSlots - item.slots.length, 2));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Account Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[10px] shrink-0">
              {PLATFORM_SHORT[item.platform] || item.platform}
            </Badge>
            <span className="font-medium text-sm truncate">{item.accountName || item.handle || item.accountId}</span>
            <span className="text-xs text-muted-foreground capitalize hidden sm:inline">{item.vertical}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span>{item.hookStyle} hooks</span>
            <span>·</span>
            <span>{item.stats.approved + item.stats.ready}/{item.maxDailyPosts} today</span>
            <Link to={`/verticals/${item.vertical}`}>
              <Settings className="w-3.5 h-3.5 hover:text-foreground transition-colors" />
            </Link>
          </div>
        </div>

        {/* Post Slots */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {item.slots.map((slot) => (
            <PostSlotCard
              key={slot.id}
              slot={slot}
              onApprove={onApprove}
              onReject={onReject}
              onProduce={onProduce}
              onClick={onSlotClick}
            />
          ))}
          {emptyCount > 0 && Array.from({ length: emptyCount }).map((_, i) => (
            <EmptySlot key={`empty-${i}`} onGenerate={() => onGenerateIdeas?.(item.accountId)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
