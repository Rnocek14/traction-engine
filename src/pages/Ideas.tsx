import { GlobalNav } from "@/components/GlobalNav";
import { ScraperHealthDashboard } from "@/components/ideas/ScraperHealthDashboard";
import { ContentIdeasPanel } from "@/components/ideas/ContentIdeasPanel";
import { IdeaQueuePanel } from "@/components/ideas/IdeaQueuePanel";
import { Button } from "@/components/ui/button";
import { useGenerateIdeas } from "@/hooks/use-ideas-data";
import { useTrendSignals } from "@/hooks/use-ideas-data";
import { Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Ideas = () => {
  const generateIdeas = useGenerateIdeas();
  const { data: signals } = useTrendSignals();

  const handleGenerate = () => {
    generateIdeas.mutate(
      { count: 5, mode: "manual" },
      {
        onSuccess: (data) => {
          toast.success(`Generated ${data?.count || 0} new ideas from trends`);
        },
        onError: (err) => {
          toast.error(`Failed to generate ideas: ${(err as Error).message}`);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ideas & Trend Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Scrape → Rank → Ideate → Approve → Produce → Measure
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generateIdeas.isPending}
            className="gap-2"
          >
            {generateIdeas.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Ideas
          </Button>
        </div>

        {/* Tabbed layout */}
        <Tabs defaultValue="ideas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ideas">Content Ideas</TabsTrigger>
            <TabsTrigger value="intelligence">Trend Intelligence</TabsTrigger>
            <TabsTrigger value="signals">Raw Signals ({signals?.length || 0})</TabsTrigger>
            <TabsTrigger value="pipeline">Production Pipeline</TabsTrigger>
          </TabsList>

          {/* Ideas Tab */}
          <TabsContent value="ideas" className="space-y-4">
            <ContentIdeasPanel />
          </TabsContent>

          {/* Trend Intelligence Tab */}
          <TabsContent value="intelligence" className="space-y-4">
            <ScraperHealthDashboard />
          </TabsContent>

          {/* Raw Signals Tab */}
          <TabsContent value="signals">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Scraped Signals</CardTitle>
              </CardHeader>
              <CardContent>
                {!signals || signals.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No scraped insights in the last 7 days. Run the scraper to feed the system.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {signals.map(signal => (
                      <div
                        key={signal.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{signal.title || "Untitled insight"}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {signal.topics?.slice(0, 4).map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {t}
                              </Badge>
                            ))}
                            {signal.content_format && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                📐 {signal.content_format}
                              </Badge>
                            )}
                          </div>
                          {signal.emotional_triggers && signal.emotional_triggers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {signal.emotional_triggers.slice(0, 3).map(e => (
                                <span key={e} className="text-[10px] text-muted-foreground">
                                  ❤️ {e}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {signal.viral_score != null && (
                            <Badge
                              variant={signal.viral_score >= 80 ? "default" : "secondary"}
                              className="text-xs tabular-nums"
                            >
                              {signal.viral_score}
                            </Badge>
                          )}
                          {signal.source_url && (
                            <a
                              href={signal.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline">
            <IdeaQueuePanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Ideas;
