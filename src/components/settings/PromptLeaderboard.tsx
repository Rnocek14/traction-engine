import { useState } from "react";
import { usePromptTemplates, usePromptFamilyStats, usePromptExperiments } from "@/hooks/use-prompt-leaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, Trophy, TrendingUp, AlertTriangle, CheckCircle, XCircle, Database, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROMPT_TEMPLATE_SEEDS } from "@/data/prompt-template-seeds";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const STAGES = ["hook", "script", "visual", "topic"] as const;

export function PromptLeaderboard() {
  const [stageFilter, setStageFilter] = useState<string>("hook");
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const { data: templates = [], isLoading: templatesLoading } = usePromptTemplates(stageFilter);
  const { data: familyStats = [], isLoading: statsLoading } = usePromptFamilyStats();
  const { data: allExperiments = [], isLoading: experimentsLoading } = usePromptExperiments({ stage: stageFilter, limit: 20 });

  const experiments = enrichedOnly
    ? allExperiments.filter(e => (e.input_context as any)?.used_scraped_insights === true)
    : allExperiments;

  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  const filteredStats = familyStats.filter(s => s.stage === stageFilter);

  const handleSeedTemplates = async () => {
    setSeeding(true);
    try {
      const { error } = await supabase.from("prompt_templates").upsert(
        PROMPT_TEMPLATE_SEEDS.map(t => ({
          ...t,
          variables_schema: t.variables_schema,
          scoring_weights: t.scoring_weights,
          verticals: [] as string[],
          platforms: [] as string[],
        })),
        { onConflict: "name" as any, ignoreDuplicates: true }
      );
      if (error) throw error;
      toast.success(`Seeded ${PROMPT_TEMPLATE_SEEDS.length} prompt templates`);
      queryClient.invalidateQueries({ queryKey: ["prompt-templates"] });
    } catch (err: any) {
      toast.error(`Seed failed: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stage selector + seed button */}
      <div className="flex items-center justify-between">
        <Tabs value={stageFilter} onValueChange={setStageFilter}>
          <TabsList>
            {STAGES.map(s => (
              <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {templates.length === 0 && (
          <Button variant="outline" size="sm" onClick={handleSeedTemplates} disabled={seeding} className="gap-2">
            <Database className="h-4 w-4" />
            {seeding ? "Seeding…" : "Seed Templates"}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<FlaskConical className="h-4 w-4" />}
          label="Templates"
          value={templates.length}
          loading={templatesLoading}
        />
        <SummaryCard
          icon={<Trophy className="h-4 w-4" />}
          label="Promoted"
          value={filteredStats.filter(s => s.promoted).length}
          loading={statsLoading}
        />
        <SummaryCard
          icon={<XCircle className="h-4 w-4" />}
          label="Retired"
          value={filteredStats.filter(s => s.retired).length}
          loading={statsLoading}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Experiments"
          value={experiments.length}
          loading={experimentsLoading}
        />
      </div>

      {/* Family stats leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            Family Leaderboard — {stageFilter}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filteredStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No family stats yet. Run experiments to populate.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead>Vertical</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Approval</TableHead>
                  <TableHead className="text-right">Perf</TableHead>
                  <TableHead className="text-right">Fatigue</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.map(stat => (
                  <TableRow key={stat.id}>
                    <TableCell className="font-medium">{stat.family}</TableCell>
                    <TableCell>{stat.vertical || "—"}</TableCell>
                    <TableCell>{stat.provider || "—"}</TableCell>
                    <TableCell className="text-right">{stat.sample_size}</TableCell>
                    <TableCell className="text-right">
                      {stat.avg_output_score != null ? stat.avg_output_score.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {stat.approval_rate != null ? `${(stat.approval_rate * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {stat.avg_performance_score != null ? stat.avg_performance_score.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {stat.fatigue_score != null ? stat.fatigue_score.toFixed(1) : "0"}
                    </TableCell>
                    <TableCell>
                      {stat.promoted && (
                        <Badge variant="default" className="gap-1 bg-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Promoted
                        </Badge>
                      )}
                      {stat.retired && (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" /> Retired
                        </Badge>
                      )}
                      {!stat.promoted && !stat.retired && (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Templates list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Templates — {stageFilter}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No templates for this stage yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Verticals</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.family}</Badge>
                    </TableCell>
                    <TableCell>
                      {t.verticals.length > 0
                        ? t.verticals.map(v => <Badge key={v} variant="secondary" className="mr-1 text-xs">{v}</Badge>)
                        : "All"}
                    </TableCell>
                    <TableCell>v{t.version}</TableCell>
                    <TableCell>
                      {t.is_active
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">Active</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent experiments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Recent Experiments — {stageFilter}
            </CardTitle>
            <Button
              variant={enrichedOnly ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setEnrichedOnly(!enrichedOnly)}
            >
              <Flame className="h-3.5 w-3.5" />
              {enrichedOnly ? "Enriched Only" : "All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {experimentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : experiments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No experiments yet. Experiments are created when prompts are generated.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Enriched</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiments.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      <Badge variant="outline">{exp.family}</Badge>
                    </TableCell>
                    <TableCell>{exp.provider || "—"}</TableCell>
                    <TableCell>
                      {(exp.input_context as any)?.used_scraped_insights ? (
                        <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                          <Flame className="w-3 h-3" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                      <StatusBadge status={exp.status} />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                      {exp.prompt_text.slice(0, 80)}…
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(exp.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          {loading ? <Skeleton className="h-6 w-8" /> : <div className="text-xl font-bold">{value}</div>}
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    created: { variant: "outline", label: "Created" },
    generated: { variant: "secondary", label: "Generated" },
    scored: { variant: "secondary", label: "Scored" },
    approved: { variant: "default", label: "Approved" },
    rejected: { variant: "destructive", label: "Rejected" },
    posted: { variant: "default", label: "Posted" },
    retired: { variant: "outline", label: "Retired" },
  };
  const entry = map[status] || { variant: "outline" as const, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
