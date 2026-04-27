import { useMemo } from "react";
import {
  useSpendSummary,
  useSystemSettings,
  useUpdateSystemSettings,
  useRecentApiCalls,
  useUpcomingWork,
  fmtUsd,
} from "@/hooks/use-cost-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Power, Activity } from "lucide-react";

export default function Cost() {
  const { data: settings } = useSystemSettings();
  const { data: spend } = useSpendSummary();
  const { data: calls } = useRecentApiCalls(30);
  const { data: upcoming } = useUpcomingWork();
  const update = useUpdateSystemSettings();

  const dailyPctUsed = useMemo(() => {
    if (!settings || !spend) return 0;
    return Math.min(100, Math.round((spend.today_cents / Math.max(1, settings.daily_spend_cap_cents)) * 100));
  }, [settings, spend]);

  const queueTotal = (q?: Record<string, number>) =>
    Object.values(q ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cost & Queue Monitor</h1>
          <p className="text-sm text-muted-foreground">Live API spend, queues, and the global automation kill switch.</p>
        </div>
        {settings && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2">
            <Power className={settings.automation_enabled ? "h-5 w-5 text-green-500" : "h-5 w-5 text-destructive"} />
            <div>
              <Label className="text-xs">Automation</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.automation_enabled}
                  onCheckedChange={(v) =>
                    update.mutate({
                      id: settings.id,
                      automation_enabled: v,
                      paused_at: v ? null : new Date().toISOString(),
                      paused_reason: v ? null : "manual",
                    })
                  }
                />
                <span className="text-sm font-medium">
                  {settings.automation_enabled ? "Running" : "Paused"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {settings && !settings.automation_enabled && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm">
              All cron-triggered AI calls are blocked. Manual generation still works.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmtUsd(spend?.today_cents ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{spend?.today_calls ?? 0} calls · {dailyPctUsed}% of cap</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Last 7 days</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{fmtUsd(spend?.last_7d_cents ?? 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Last 30 days</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{fmtUsd(spend?.last_30d_cents ?? 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Historical (legacy)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmtUsd(spend?.legacy_total_cents ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">From script_runs.generation_cost_cents</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend caps */}
      {settings && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Spend Caps (USD)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              ["Daily", "daily_spend_cap_cents"],
              ["Per story", "per_story_cap_cents"],
              ["Per product", "per_product_cap_cents"],
            ] as const).map(([label, key]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={(settings[key] / 100).toFixed(2)}
                    className="h-9"
                    onBlur={(e) => {
                      const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                      if (cents !== settings[key]) {
                        update.mutate({ id: settings.id, [key]: cents } as never);
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Queues */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["video_jobs", "story_jobs", "compare_queue"] as const).map((k) => (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {k.replace("_", " ")} ({queueTotal(spend?.queues?.[k])})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {Object.entries(spend?.queues?.[k] ?? {}).map(([s, n]) => (
                <div key={s} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{s}</span>
                  <Badge variant="outline">{n}</Badge>
                </div>
              ))}
              {Object.keys(spend?.queues?.[k] ?? {}).length === 0 && (
                <p className="text-xs text-muted-foreground">empty</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming work per account — backlog & worst-case spend if all flushed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Upcoming work by account</span>
            {upcoming?.totals && (
              <span className="text-xs text-muted-foreground font-normal">
                {upcoming.totals.accounts_with_backlog} account(s) ·{" "}
                {upcoming.totals.stories_pending} stories pending ·{" "}
                {upcoming.totals.videos_active} videos active · worst-case{" "}
                <span className={upcoming.totals.worst_case_cents > (settings?.daily_spend_cap_cents ?? 0) ? "text-destructive font-semibold" : ""}>
                  {fmtUsd(upcoming.totals.worst_case_cents)}
                </span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming?.accounts?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-right py-2 font-medium">Ideas</th>
                    <th className="text-right py-2 font-medium">Stories pending</th>
                    <th className="text-right py-2 font-medium">Videos active</th>
                    <th className="text-right py-2 font-medium">Oldest</th>
                    <th className="text-right py-2 font-medium">Worst-case $</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.accounts.map((a) => {
                    const overCap = !!settings && a.worst_case_cents > settings.daily_spend_cap_cents;
                    return (
                      <tr key={a.account_id} className="border-b border-border/50">
                        <td className="py-2 font-mono">{a.account_id}</td>
                        <td className="text-right py-2">{a.ideas_proposed || "—"}</td>
                        <td className="text-right py-2">
                          {a.stories_total > 0 ? (
                            <span>
                              {a.stories_total}
                              <span className="text-muted-foreground ml-1">
                                ({a.stories_draft}d/{a.stories_generating}g/{a.stories_partial}p)
                              </span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="text-right py-2">
                          {a.videos_active > 0 ? (
                            <span>
                              {a.videos_active}
                              <span className="text-muted-foreground ml-1">
                                ({a.videos_queued}q/{a.videos_running}r)
                              </span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="text-right py-2 text-muted-foreground">
                          {a.oldest_pending_at ? new Date(a.oldest_pending_at).toLocaleDateString() : "—"}
                        </td>
                        <td className={"text-right py-2 font-medium " + (overCap ? "text-destructive" : "")}>
                          {fmtUsd(a.worst_case_cents)}
                          {overCap && <span className="ml-1">⚠</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">
                Worst-case = if every pending story produced ~3 videos avg + active video jobs finished. d=draft, g=generating, p=partial, q=queued, r=running.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No backlog. Queues are empty.</p>
          )}
        </CardContent>
      </Card>

      {/* Provider + Function breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Spend by provider (7d)</CardTitle></CardHeader>
          <CardContent>
            {spend?.by_provider?.length ? (
              <div className="space-y-2">
                {spend.by_provider.map((p) => (
                  <div key={p.provider} className="flex justify-between text-sm">
                    <span>{p.provider}</span>
                    <span className="text-muted-foreground">
                      {fmtUsd(p.cost_cents)} <span className="text-xs">({p.calls} calls)</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No logged calls yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Top functions (7d)</CardTitle></CardHeader>
          <CardContent>
            {spend?.by_function?.length ? (
              <div className="space-y-2">
                {spend.by_function.map((f) => (
                  <div key={f.function_name} className="flex justify-between text-sm">
                    <span className="truncate">{f.function_name}</span>
                    <span className="text-muted-foreground">{fmtUsd(f.cost_cents)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No logged calls yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recent calls */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent API calls</CardTitle></CardHeader>
        <CardContent>
          {calls?.length ? (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {calls.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50">
                  <Badge variant={c.status === "success" ? "outline" : c.status === "blocked" ? "secondary" : "destructive"} className="text-[10px]">
                    {c.status}
                  </Badge>
                  <span className="font-mono w-16">{c.provider}</span>
                  <span className="flex-1 truncate text-muted-foreground">{c.function_name}</span>
                  <span className="w-16 text-right">{fmtUsd(c.cost_cents)}</span>
                  <span className="w-32 text-right text-muted-foreground">
                    {new Date(c.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No calls logged yet. Calls will appear here as the instrumented edge functions run.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
