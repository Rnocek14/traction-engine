import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/components/GlobalNav";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PipelineVisualizer } from "@/components/dashboard/PipelineVisualizer";
import { AccountsGrid } from "@/components/dashboard/AccountsGrid";
import { RecentVideos } from "@/components/dashboard/RecentVideos";
import { VerticalPerformance } from "@/components/dashboard/VerticalPerformance";
import { CostOverlay } from "@/components/dashboard/CostOverlay";
import { Button } from "@/components/ui/button";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Film,
  Video, 
  TrendingUp, 
  CheckCircle,
  AlertTriangle,
  FileText,
  Plus,
} from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { data: metrics, isLoading } = useDashboardMetrics();

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      
      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Quick action */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Production overview</p>
          </div>
          <Button onClick={() => navigate("/produce")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Story
          </Button>
        </div>

        {/* Hero metrics - real data */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard
            title="Total Stories"
            value={isLoading ? "—" : String(metrics?.totalStories || 0)}
            subtitle={isLoading ? "Loading..." : `${metrics?.storiesByStatus?.["generating"] || 0} generating`}
            icon={<Film className="w-5 h-5" />}
            variant="primary"
          />
          <MetricCard
            title="Videos Today"
            value={isLoading ? "—" : String(metrics?.videosToday || 0)}
            subtitle={isLoading ? "Loading..." : `${metrics?.videosRunning || 0} in progress`}
            icon={<Video className="w-5 h-5" />}
            variant="success"
          />
          <MetricCard
            title="Videos Complete"
            value={isLoading ? "—" : String(metrics?.videosCompleted || 0)}
            subtitle="All time"
            icon={<CheckCircle className="w-5 h-5" />}
            variant="primary"
          />
          <MetricCard
            title="Scripts Generated"
            value={isLoading ? "—" : String(metrics?.totalScripts || 0)}
            subtitle={isLoading ? "Loading..." : `${metrics?.scriptsQAPassed || 0} QA passed`}
            icon={<FileText className="w-5 h-5" />}
            variant="success"
          />
          <MetricCard
            title="Assembly Rate"
            value={isLoading ? "—" : `${metrics?.assemblySuccessRate || 0}%`}
            subtitle="Success rate"
            icon={<TrendingUp className="w-5 h-5" />}
            variant="primary"
          />
          <MetricCard
            title="Failed Videos"
            value={isLoading ? "—" : String(metrics?.videosFailed || 0)}
            subtitle={isLoading ? "Loading..." : `${metrics?.scriptsQAFailed || 0} scripts failed`}
            icon={<AlertTriangle className="w-5 h-5" />}
            trend={metrics?.videosFailed ? { value: metrics.videosFailed, isPositive: false } : undefined}
            variant="warning"
          />
        </section>

        {/* Pipeline */}
        <section>
          <PipelineVisualizer />
        </section>

        {/* Cost Monitor */}
        <section>
          <CostOverlay />
        </section>

        {/* Verticals */}
        <section>
          <VerticalPerformance />
        </section>

        {/* Accounts and Videos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <AccountsGrid />
          <RecentVideos />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-12">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>Content Engine v1.0 • Powered by GPT-4, ElevenLabs, Sora, FFmpeg</p>
            <p>Data refreshes every 30s</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
