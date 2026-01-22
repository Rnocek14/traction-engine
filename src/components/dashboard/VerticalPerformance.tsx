import { cn } from "@/lib/utils";
import { Shield, GraduationCap, HeartPulse, TrendingUp, Users, Play } from "lucide-react";

interface Vertical {
  id: string;
  name: string;
  icon: typeof Shield;
  color: string;
  bgGradient: string;
  accounts: number;
  totalFollowers: number;
  avgEngagement: number;
  videosThisWeek: number;
  topPerformer: string;
  weeklyGrowth: number;
}

const verticals: Vertical[] = [
  {
    id: "privacy",
    name: "Digital Privacy",
    icon: Shield,
    color: "text-cyan-400",
    bgGradient: "from-cyan-500/10 to-blue-500/10",
    accounts: 8,
    totalFollowers: 145600,
    avgEngagement: 7.4,
    videosThisWeek: 42,
    topPerformer: "@FootprintFinder",
    weeklyGrowth: 14,
  },
  {
    id: "education",
    name: "Career & Education",
    icon: GraduationCap,
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/10 to-teal-500/10",
    accounts: 12,
    totalFollowers: 284300,
    avgEngagement: 9.8,
    videosThisWeek: 68,
    topPerformer: "@CareerBoostHQ",
    weeklyGrowth: 21,
  },
  {
    id: "health",
    name: "Health & Recovery",
    icon: HeartPulse,
    color: "text-rose-400",
    bgGradient: "from-rose-500/10 to-pink-500/10",
    accounts: 5,
    totalFollowers: 48200,
    avgEngagement: 6.2,
    videosThisWeek: 24,
    topPerformer: "@StrokeRecovery",
    weeklyGrowth: 8,
  },
];

export function VerticalPerformance() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Vertical Performance</h3>
          <p className="text-sm text-muted-foreground">
            Content strategy by niche
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {verticals.map((vertical, index) => (
          <VerticalCard key={vertical.id} vertical={vertical} index={index} />
        ))}
      </div>
    </div>
  );
}

function VerticalCard({ vertical, index }: { vertical: Vertical; index: number }) {
  const Icon = vertical.icon;

  return (
    <div
      className={cn(
        "p-5 rounded-xl border border-border/50 bg-gradient-to-br transition-all duration-300 hover:scale-[1.02] animate-fade-in",
        vertical.bgGradient
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2.5 rounded-lg bg-background/50", vertical.color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold">{vertical.name}</h4>
          <p className="text-xs text-muted-foreground">
            {vertical.accounts} accounts
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatItem 
          icon={Users} 
          label="Followers" 
          value={formatNumber(vertical.totalFollowers)} 
        />
        <StatItem 
          icon={TrendingUp} 
          label="Engagement" 
          value={`${vertical.avgEngagement}%`} 
        />
        <StatItem 
          icon={Play} 
          label="This Week" 
          value={`${vertical.videosThisWeek} vids`} 
        />
        <StatItem 
          icon={TrendingUp} 
          label="Growth" 
          value={`+${vertical.weeklyGrowth}%`}
          valueClass="text-success"
        />
      </div>

      {/* Top performer */}
      <div className="pt-3 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-1">Top Performer</p>
        <p className={cn("text-sm font-medium", vertical.color)}>
          {vertical.topPerformer}
        </p>
      </div>
    </div>
  );
}

function StatItem({ 
  icon: Icon, 
  label, 
  value,
  valueClass = ""
}: { 
  icon: typeof Users; 
  label: string; 
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm font-mono font-medium", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
