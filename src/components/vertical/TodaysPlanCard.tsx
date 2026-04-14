import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Play, Settings2 } from "lucide-react";
import type { TodaysPlan } from "@/hooks/use-vertical-engine";

interface Props {
  plan: TodaysPlan;
  vertical: string;
  onRunEngine: () => void;
  isRunning: boolean;
  onOpenSettings: () => void;
}

export function TodaysPlanCard({ plan, vertical, onRunEngine, isRunning, onOpenSettings }: Props) {
  const totalTarget = plan.growthTarget + plan.productTarget;
  const progress = totalTarget > 0 ? Math.min(100, Math.round((plan.todayTotal / totalTarget) * 100)) : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Today's Plan
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenSettings}>
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={onRunEngine}
              disabled={isRunning || !plan.needsContent}
              className="gap-1.5 h-7 text-xs"
            >
              <Play className="w-3 h-3" />
              {isRunning ? "Running..." : plan.needsContent ? "Generate Content" : "Target Met"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{plan.todayTotal} / {totalTarget} posts today</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Mix breakdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground">Growth</p>
              <p className="text-sm font-semibold">{plan.todayGrowth} / {plan.growthTarget}</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {plan.config?.growth_ratio || 80}%
            </Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="text-sm font-semibold">{plan.todayProduct} / {plan.productTarget}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {100 - (plan.config?.growth_ratio || 80)}%
            </Badge>
          </div>
        </div>

        {/* Auto-generate status */}
        {plan.config && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${plan.config.auto_generate ? "bg-green-500" : "bg-muted-foreground/30"}`} />
            Auto-generation: {plan.config.auto_generate ? "ON" : "OFF"}
            {plan.config.last_engine_run_at && (
              <span>· Last run: {new Date(plan.config.last_engine_run_at).toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
