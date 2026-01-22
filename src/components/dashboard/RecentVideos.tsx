import { cn } from "@/lib/utils";
import { Eye, Heart, Share2, MessageCircle, Clock, ExternalLink } from "lucide-react";

interface Video {
  id: string;
  title: string;
  account: string;
  platform: "tiktok" | "instagram";
  thumbnail: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  postedAt: string;
  status: "live" | "scheduled" | "processing";
}

const videos: Video[] = [
  {
    id: "1",
    title: "5 Apps Secretly Tracking Your Location",
    account: "@FootprintFinder",
    platform: "tiktok",
    thumbnail: "🔒",
    views: 45200,
    likes: 3200,
    shares: 890,
    comments: 234,
    postedAt: "2h ago",
    status: "live",
  },
  {
    id: "2",
    title: "Resume Red Flags HR Won't Tell You",
    account: "@CareerBoostHQ",
    platform: "tiktok",
    thumbnail: "📄",
    views: 128000,
    likes: 12400,
    shares: 4500,
    comments: 890,
    postedAt: "4h ago",
    status: "live",
  },
  {
    id: "3",
    title: "Interview Answer That Always Works",
    account: "@InterviewAce",
    platform: "instagram",
    thumbnail: "💼",
    views: 34500,
    likes: 2800,
    shares: 1200,
    comments: 156,
    postedAt: "6h ago",
    status: "live",
  },
  {
    id: "4",
    title: "Delete Your Digital Footprint in 10 Min",
    account: "@PrivacyShield",
    platform: "instagram",
    thumbnail: "🛡️",
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    postedAt: "in 2h",
    status: "scheduled",
  },
  {
    id: "5",
    title: "Recovery Exercise for Stroke Survivors",
    account: "@StrokeRecovery",
    platform: "tiktok",
    thumbnail: "💪",
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    postedAt: "rendering",
    status: "processing",
  },
];

export function RecentVideos() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Recent Content</h3>
          <p className="text-sm text-muted-foreground">
            Latest videos across all accounts
          </p>
        </div>
        <button className="text-sm text-primary hover:underline flex items-center gap-1">
          View all
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-3">
        {videos.map((video, index) => (
          <VideoRow key={video.id} video={video} index={index} />
        ))}
      </div>
    </div>
  );
}

function VideoRow({ video, index }: { video: Video; index: number }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-all duration-300 cursor-pointer animate-slide-in"
      )}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {/* Thumbnail placeholder */}
      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-2xl shrink-0">
        {video.thumbnail}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("platform-badge", video.platform)}>
            {video.platform === "tiktok" ? "TT" : "IG"}
          </span>
          <h4 className="font-medium text-sm truncate">{video.title}</h4>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{video.account}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {video.postedAt}
          </span>
        </div>
      </div>

      {/* Status / Metrics */}
      {video.status === "live" ? (
        <div className="flex items-center gap-4 text-xs">
          <MetricPill icon={Eye} value={video.views} />
          <MetricPill icon={Heart} value={video.likes} />
          <MetricPill icon={Share2} value={video.shares} />
          <MetricPill icon={MessageCircle} value={video.comments} />
        </div>
      ) : (
        <div
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium",
            video.status === "scheduled" && "bg-warning/10 text-warning",
            video.status === "processing" && "bg-primary/10 text-primary"
          )}
        >
          {video.status === "scheduled" ? "Scheduled" : "Processing..."}
        </div>
      )}
    </div>
  );
}

function MetricPill({ icon: Icon, value }: { icon: typeof Eye; value: number }) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Icon className="w-3 h-3" />
      <span className="font-mono">{formatCompact(value)}</span>
    </div>
  );
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
