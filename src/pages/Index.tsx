import { GlobalNav } from "@/components/GlobalNav";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PipelineVisualizer } from "@/components/dashboard/PipelineVisualizer";
import { AccountsGrid } from "@/components/dashboard/AccountsGrid";
import { RecentVideos } from "@/components/dashboard/RecentVideos";
import { VerticalPerformance } from "@/components/dashboard/VerticalPerformance";
import { CostOverlay } from "@/components/dashboard/CostOverlay";
import { 
  Users, 
  Video, 
  TrendingUp, 
  DollarSign,
  Eye,
  Share2
} from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      
      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Hero metrics */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <MetricCard
            title="Total Followers"
            value="478.1K"
            subtitle="Across 50 accounts"
            icon={<Users className="w-5 h-5" />}
            trend={{ value: 12.4, isPositive: true }}
            variant="primary"
          />
          <MetricCard
            title="Videos Today"
            value="24"
            subtitle="18 published, 6 pending"
            icon={<Video className="w-5 h-5" />}
            variant="success"
          />
          <MetricCard
            title="Total Views"
            value="2.4M"
            subtitle="Last 7 days"
            icon={<Eye className="w-5 h-5" />}
            trend={{ value: 23.8, isPositive: true }}
            variant="primary"
          />
          <MetricCard
            title="Engagement Rate"
            value="8.7%"
            subtitle="Avg. across network"
            icon={<TrendingUp className="w-5 h-5" />}
            trend={{ value: 1.2, isPositive: true }}
            variant="success"
          />
          <MetricCard
            title="Shares / Sends"
            value="12.4K"
            subtitle="Key viral signal"
            icon={<Share2 className="w-5 h-5" />}
            trend={{ value: 34.2, isPositive: true }}
            variant="primary"
          />
          <MetricCard
            title="Daily Cost"
            value="$24.80"
            subtitle="LLM + TTS + Sora"
            icon={<DollarSign className="w-5 h-5" />}
            trend={{ value: 5.2, isPositive: false }}
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
            <p>Last sync: 2 minutes ago</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
