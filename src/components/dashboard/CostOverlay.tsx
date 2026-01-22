import { cn } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { centsToDisplay, getTopCostDriver, type CostBreakdown } from "@/types/content-engine";

// Using cents to avoid float precision issues
interface CostData {
  daily: {
    spentCents: number;
    budgetCents: number;
    breakdown: CostBreakdown;
  };
  weekly: {
    spentCents: number;
    trend: number;
  };
  perVideo: {
    averageCents: number;
    trend: number;
  };
  roi: {
    value: number;
    status: "positive" | "neutral" | "negative";
  };
}

const costData: CostData = {
  daily: {
    spentCents: 2480, // $24.80
    budgetCents: 3500, // $35.00
    breakdown: {
      llmCents: 420,    // $4.20
      ttsCents: 840,    // $8.40
      videoCents: 1120, // $11.20
      otherCents: 100,  // $1.00
    },
  },
  weekly: {
    spentCents: 15640, // $156.40
    trend: -8.2,
  },
  perVideo: {
    averageCents: 42, // $0.42
    trend: -5.1,
  },
  roi: {
    value: 443,
    status: "positive",
  },
};

export function CostOverlay() {
  const budgetPercentage = (costData.daily.spentCents / costData.daily.budgetCents) * 100;
  const isOverBudget = budgetPercentage > 100;
  const isNearBudget = budgetPercentage > 85;
  
  // Get top cost driver for immediate insight
  const topDriver = getTopCostDriver(costData.daily.breakdown);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-warning" />
          <div>
            <h3 className="text-lg font-semibold">Cost Monitor</h3>
            <p className="text-xs text-muted-foreground">
              Top driver: <span className="text-warning font-medium">{topDriver.label}</span> ({centsToDisplay(topDriver.cents)})
            </p>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            costData.roi.status === "positive" && "border-success text-success",
            costData.roi.status === "neutral" && "border-muted-foreground text-muted-foreground",
            costData.roi.status === "negative" && "border-destructive text-destructive"
          )}
        >
          ROI: {costData.roi.value > 0 ? '+' : ''}{costData.roi.value}%
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Budget */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Daily Budget</span>
              <span className="text-sm font-mono">
                {centsToDisplay(costData.daily.spentCents)} / {centsToDisplay(costData.daily.budgetCents)}
              </span>
            </div>
            <Progress 
              value={Math.min(budgetPercentage, 100)} 
              className={cn(
                "h-2",
                isOverBudget && "[&>div]:bg-destructive",
                isNearBudget && !isOverBudget && "[&>div]:bg-warning"
              )}
            />
            {isNearBudget && (
              <div className="flex items-center gap-1 mt-2 text-xs text-warning">
                <AlertCircle className="w-3 h-3" />
                {isOverBudget ? "Over budget" : "Approaching limit"}
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            <CostBreakdownRow label="LLM (GPT-4)" valueCents={costData.daily.breakdown.llmCents} totalCents={costData.daily.spentCents} color="bg-cyan-500" />
            <CostBreakdownRow label="TTS (Eleven)" valueCents={costData.daily.breakdown.ttsCents} totalCents={costData.daily.spentCents} color="bg-emerald-500" />
            <CostBreakdownRow label="Video (Sora)" valueCents={costData.daily.breakdown.videoCents} totalCents={costData.daily.spentCents} color="bg-violet-500" />
            <CostBreakdownRow label="Other" valueCents={costData.daily.breakdown.otherCents} totalCents={costData.daily.spentCents} color="bg-muted-foreground" />
          </div>
        </div>

        {/* Weekly Spend */}
        <div className="glass-card p-4 bg-secondary/20">
          <span className="text-xs text-muted-foreground">Weekly Spend</span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-2xl font-mono font-semibold">{centsToDisplay(costData.weekly.spentCents)}</span>
            <TrendIndicator value={costData.weekly.trend} inverted />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {costData.weekly.trend < 0 ? 'Down' : 'Up'} from last week
          </p>
        </div>

        {/* Per-Video Cost */}
        <div className="glass-card p-4 bg-secondary/20">
          <span className="text-xs text-muted-foreground">Avg Cost per Video</span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-2xl font-mono font-semibold">{centsToDisplay(costData.perVideo.averageCents)}</span>
            <TrendIndicator value={costData.perVideo.trend} inverted />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Across all verticals
          </p>
        </div>
      </div>
    </div>
  );
}

function CostBreakdownRow({ label, valueCents, totalCents, color }: { 
  label: string; 
  valueCents: number; 
  totalCents: number; 
  color: string;
}) {
  const percentage = totalCents > 0 ? (valueCents / totalCents) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <span className="text-xs font-mono">{centsToDisplay(valueCents)}</span>
      <span className="text-xs text-muted-foreground w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}

function TrendIndicator({ value, inverted = false }: { value: number; inverted?: boolean }) {
  // For costs, negative is good (inverted)
  const isGood = inverted ? value < 0 : value > 0;
  return (
    <div className={cn(
      "flex items-center gap-0.5 text-xs font-mono",
      isGood ? "text-success" : "text-destructive"
    )}>
      {value < 0 ? (
        <TrendingDown className="w-3 h-3" />
      ) : (
        <TrendingUp className="w-3 h-3" />
      )}
      {Math.abs(value)}%
    </div>
  );
}

// Mini cost badge for inline use
export function CostBadge({ cost, className }: { cost: number; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono bg-warning/10 text-warning",
      className
    )}>
      <DollarSign className="w-3 h-3" />
      {cost.toFixed(2)}
    </span>
  );
}

// ROI badge component
export function ROIBadge({ value, className }: { value: number; className?: string }) {
  const isPositive = value > 0;
  const status = value > 50 ? "positive" : value > 0 ? "neutral" : "negative";
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono",
      status === "positive" && "bg-success/10 text-success",
      status === "neutral" && "bg-warning/10 text-warning",
      status === "negative" && "bg-destructive/10 text-destructive",
      className
    )}>
      ROI: {isPositive ? '+' : ''}{value}%
    </span>
  );
}
