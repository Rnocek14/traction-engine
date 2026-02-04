/**
 * Settings - Centralized settings hub
 * 
 * Tabs:
 * - Providers (routing analytics, provider config)
 * - Accounts (account details)
 * - Advanced (compare tool, learning)
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, Activity, Users, Beaker } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalNav } from "@/components/GlobalNav";
import RoutingAnalytics from "./RoutingAnalytics";
import AccountDetail from "./AccountDetail";
import { ComparePanel } from "@/components/lab/ComparePanel";
import { LearningInspector } from "@/components/lab/LearningInspector";

export default function Settings() {
  const { accountId, tab } = useParams<{ accountId?: string; tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab || "providers");

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate(`/settings/${value}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalNav />

      <div className="flex-1 container mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            <TabsTrigger value="providers" className="gap-2">
              <Activity className="h-4 w-4" />
              Providers & Routing
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2">
              <Users className="h-4 w-4" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Beaker className="h-4 w-4" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-0">
            <RoutingAnalyticsEmbed />
          </TabsContent>

          <TabsContent value="accounts" className="mt-0">
            {accountId ? (
              <AccountDetail />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Select an account from the dashboard to view details
              </div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="mt-0">
            <AdvancedSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Embedded routing analytics (without the header/nav)
 */
function RoutingAnalyticsEmbed() {
  // This is a simplified version - in a real app you'd refactor RoutingAnalytics
  // to accept a prop that hides its own header
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Provider routing analytics and configuration.
      </p>
      {/* For now, just link to the full page */}
      <div className="p-8 border rounded-lg bg-card text-center">
        <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">
          View detailed routing analytics and provider performance.
        </p>
        <a href="/studio/analytics" className="text-primary hover:underline">
          Open Routing Analytics →
        </a>
      </div>
    </div>
  );
}

/**
 * Advanced settings - Compare tool, Learning inspector
 */
function AdvancedSettings() {
  const [activeSection, setActiveSection] = useState<"compare" | "learning">("compare");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection("compare")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === "compare"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Video Compare
        </button>
        <button
          onClick={() => setActiveSection("learning")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === "learning"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Learning Inspector
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 300px)" }}>
        {activeSection === "compare" ? (
          <ComparePanel
            initialJobIdA={null}
            initialJobIdB={null}
            onJobIdsChange={() => {}}
          />
        ) : (
          <LearningInspector />
        )}
      </div>
    </div>
  );
}
