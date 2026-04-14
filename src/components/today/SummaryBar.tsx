import { CheckCircle, Loader2, AlertTriangle, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TodaySummary } from "@/hooks/use-today-feed";

interface SummaryBarProps {
  summary: TodaySummary;
}

const STATS = [
  { key: "totalReady" as const, label: "Ready to Review", icon: CheckCircle, highlight: true },
  { key: "totalGenerating" as const, label: "Generating", icon: Loader2 },
  { key: "totalIdeasLow" as const, label: "Low Inventory", icon: AlertTriangle, warn: true },
  { key: "totalApproved" as const, label: "Approved Today", icon: ThumbsUp },
];

export function SummaryBar({ summary }: SummaryBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {STATS.map(({ key, label, icon: Icon, highlight, warn }) => {
        const val = summary[key];
        return (
          <Card key={key} className={val > 0 && highlight ? "ring-1 ring-primary/30" : val > 0 && warn ? "ring-1 ring-destructive/30" : ""}>
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 shrink-0 ${val > 0 && warn ? "text-destructive" : val > 0 && highlight ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <p className="text-xl font-bold">{val}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
