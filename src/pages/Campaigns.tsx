import { useState, useMemo } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target, TrendingUp, Loader2, Sparkles } from "lucide-react";
import { useApps } from "@/hooks/use-apps";
import { useAppAngles, useAngleScoreboard, type AppAngle } from "@/hooks/use-app-angles";
import { AngleEditDialog } from "@/components/campaigns/AngleEditDialog";

function statusTone(s: string) {
  if (s === "winner") return "default";
  if (s === "loser") return "destructive";
  if (s === "paused") return "outline";
  return "secondary";
}

export default function Campaigns() {
  const { data: apps = [], isLoading: appsLoading } = useApps();
  const [selectedAppId, setSelectedAppId] = useState<string | undefined>();

  const activeApp = useMemo(
    () => apps.find(a => a.id === selectedAppId) ?? apps[0],
    [apps, selectedAppId]
  );
  const appId = activeApp?.id;

  const { data: angles = [], isLoading: anglesLoading } = useAppAngles(appId);
  const { data: scoreboard = [] } = useAngleScoreboard(appId);

  const stats = useMemo(() => {
    const map = new Map<string, { videos: number; assembled: number; approved: number }>();
    scoreboard.forEach((s: any) => map.set(s.id, { videos: s.videos, assembled: s.assembled, approved: s.approved }));
    return map;
  }, [scoreboard]);

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="w-6 h-6" /> Campaigns
            </h1>
            <p className="text-sm text-muted-foreground">
              Pick an app, define angles, run manual test videos. Learn what converts before automating.
            </p>
          </div>
        </div>

        {/* App picker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Marketing target</CardTitle>
          </CardHeader>
          <CardContent>
            {appsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No apps yet. Add one in <a href="/catalog" className="underline">Catalog</a>.
              </p>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={appId} onValueChange={setSelectedAppId}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Choose an app" />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.verticals.length > 0 ? `· ${a.verticals.join(", ")}` : "· (no vertical)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeApp && (
                  <>
                    <Badge variant={activeApp.readiness_score >= 40 ? "default" : "outline"}>
                      Readiness {activeApp.readiness_score}/100
                    </Badge>
                    {activeApp.verticals.map(v => (
                      <Badge key={v} variant="secondary">{v}</Badge>
                    ))}
                    {activeApp.verticals.length === 0 && (
                      <Badge variant="outline" className="text-amber-600 border-amber-600/50">
                        No vertical assigned
                      </Badge>
                    )}
                  </>
                )}
              </div>
            )}

            {activeApp?.value_prop && (
              <p className="text-sm text-foreground mt-3">{activeApp.value_prop}</p>
            )}
          </CardContent>
        </Card>

        {/* Angles board */}
        {activeApp && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Angles</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Each angle is a hypothesis. Test 5–10 videos per angle, then promote winners.
                </p>
              </div>
              <AngleEditDialog
                appId={activeApp.id}
                trigger={
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-1" /> New angle
                  </Button>
                }
              />
            </CardHeader>
            <CardContent>
              {anglesLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : angles.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  No angles yet. Add 1–3 to start testing.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {angles.map(angle => (
                    <AngleRow
                      key={angle.id}
                      appId={activeApp.id}
                      angle={angle}
                      videos={stats.get(angle.id)?.videos ?? 0}
                      assembled={stats.get(angle.id)?.assembled ?? 0}
                      approved={stats.get(angle.id)?.approved ?? 0}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual test workflow hint */}
        {activeApp && (
          <Card className="border-dashed">
            <CardContent className="py-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Manual test loop (recommended)</div>
                <ol className="text-muted-foreground list-decimal list-inside mt-1 space-y-0.5">
                  <li>Pick or create an angle above.</li>
                  <li>Open <a href="/studio" className="underline">Studio</a> and create 3–5 videos using its hooks.</li>
                  <li>Tag each story job with this angle (we'll add the picker next).</li>
                  <li>Watch the scoreboard fill in. Promote winners after 10 videos.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function AngleRow({
  appId,
  angle,
  videos,
  assembled,
  approved,
}: {
  appId: string;
  angle: AppAngle;
  videos: number;
  assembled: number;
  approved: number;
}) {
  return (
    <div className="border rounded-lg p-3 flex flex-col gap-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <span className="truncate">{angle.name}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">{angle.emotion}</Badge>
          </div>
          {angle.hypothesis && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{angle.hypothesis}</p>
          )}
        </div>
        <Badge variant={statusTone(angle.status)}>{angle.status}</Badge>
      </div>

      {angle.hook_examples.length > 0 && (
        <div className="text-xs text-muted-foreground italic line-clamp-2">
          "{angle.hook_examples[0]}"
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {videos} videos
        </span>
        <span>· {assembled} assembled</span>
        <span>· {approved} approved</span>
        <div className="ml-auto">
          <AngleEditDialog
            appId={appId}
            angle={angle}
            trigger={<Button variant="ghost" size="sm" className="h-7 text-xs">Edit</Button>}
          />
        </div>
      </div>
    </div>
  );
}
