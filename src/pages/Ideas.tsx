import { GlobalNav } from "@/components/GlobalNav";
import { TrendIntelligencePanel } from "@/components/ideas/TrendIntelligencePanel";
import { ContentIdeasPanel } from "@/components/ideas/ContentIdeasPanel";
import { IdeaQueuePanel } from "@/components/ideas/IdeaQueuePanel";
import { Button } from "@/components/ui/button";
import { useGenerateIdeas } from "@/hooks/use-ideas-data";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Ideas = () => {
  const generateIdeas = useGenerateIdeas();

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

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ideas</h1>
            <p className="text-sm text-muted-foreground">
              Trends → Ideas → Approve → Produce → Measure
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

        {/* Trend Intelligence */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Trend Intelligence</h2>
          <TrendIntelligencePanel />
        </section>

        {/* AI-Proposed Ideas */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Content Ideas</h2>
          <ContentIdeasPanel />
        </section>

        {/* Production Pipeline */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Production Pipeline</h2>
          <IdeaQueuePanel />
        </section>
      </main>
    </div>
  );
};

export default Ideas;
