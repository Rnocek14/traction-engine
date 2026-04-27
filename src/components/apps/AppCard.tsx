import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles } from "lucide-react";
import type { App } from "@/hooks/use-apps";

interface AppCardProps {
  app: App;
  onEdit?: (app: App) => void;
}

function readinessTone(score: number) {
  if (score >= 70) return "default";
  if (score >= 40) return "secondary";
  return "outline";
}

export function AppCard({ app, onEdit }: AppCardProps) {
  const ready = app.readiness_score >= 40;
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate">{app.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {app.cta_url ?? app.url ?? "no url"}
            </p>
          </div>
          <Badge variant={readinessTone(app.readiness_score)}>
            {app.readiness_score}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        {app.value_prop && (
          <p className="text-sm text-foreground line-clamp-3">{app.value_prop}</p>
        )}

        {app.verticals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {app.verticals.map((v) => (
              <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
            ))}
          </div>
        )}

        {app.target_audience && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Audience: </span>
            {app.target_audience}
          </div>
        )}

        {app.hooks.length > 0 && (
          <div className="text-xs">
            <div className="font-medium mb-1">Top hook</div>
            <div className="text-muted-foreground italic line-clamp-2">"{app.hooks[0]}"</div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2">
          {app.cta_url && (
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href={app.cta_url} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
              </a>
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            disabled={!ready}
            onClick={() => onEdit?.(app)}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            {ready ? "Edit" : "Needs setup"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
