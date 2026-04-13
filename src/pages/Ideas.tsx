import { GlobalNav } from "@/components/GlobalNav";
import { TrendIntelligencePanel } from "@/components/ideas/TrendIntelligencePanel";
import { IdeaQueuePanel } from "@/components/ideas/IdeaQueuePanel";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

const Ideas = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ideas</h1>
            <p className="text-sm text-muted-foreground">
              Trends → Ideas → Prompts → Videos → Performance
            </p>
          </div>
          <Button onClick={() => navigate("/produce")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Story
          </Button>
        </div>

        {/* Trend Intelligence */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Trend Intelligence</h2>
          <TrendIntelligencePanel />
        </section>

        {/* Idea Pipeline */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Idea Pipeline & Lineage</h2>
          <IdeaQueuePanel />
        </section>
      </main>
    </div>
  );
};

export default Ideas;
