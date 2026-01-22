import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { QAInboxFilters } from "@/components/qa-inbox/QAInboxFilters";
import { QAReviewCard } from "@/components/qa-inbox/QAReviewCard";
import {
  useQAInbox,
  useAccountConfigs,
  useQAInboxStats,
  useOverrideQA,
  useRegenerateScript,
  type QAInboxTab,
} from "@/hooks/use-qa-inbox";
import type { Enums } from "@/integrations/supabase/types";

export default function QAReviewInbox() {
  // Filter state
  const [tab, setTab] = useState<QAInboxTab>('qa_failed');
  const [vertical, setVertical] = useState<Enums<'content_vertical'> | 'all'>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Data hooks
  const { data: stats, isLoading: statsLoading } = useQAInboxStats();
  const { data: accounts = [] } = useAccountConfigs();
  const { 
    data: items = [], 
    isLoading: itemsLoading,
    refetch,
  } = useQAInbox({ tab, vertical, accountId, search });

  // Mutations
  const overrideMutation = useOverrideQA();
  const regenerateMutation = useRegenerateScript();

  // Action handlers
  const handleOverride = (scriptId: string, reason: string) => {
    overrideMutation.mutate({
      scriptId,
      overrideBy: 'admin', // In production, use actual user
      reason,
    });
  };

  const handleRegenerate = (accountId: string) => {
    regenerateMutation.mutate({
      accountId,
      mode: 'ai',
    });
  };

  const isHardBlockTab = tab === 'hard_block';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              <div className="h-8 w-px bg-border" />
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-warning" />
                  QA Review Inbox
                </h1>
                <p className="text-sm text-muted-foreground">
                  {statsLoading ? (
                    <Skeleton className="h-4 w-32 inline-block" />
                  ) : (
                    `${stats?.total || 0} scripts pending review`
                  )}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-4 text-sm">
              <Badge 
                variant="outline" 
                className={cn(
                  "gap-1",
                  "text-destructive border-destructive/50"
                )}
              >
                <ShieldAlert className="w-3 h-3" />
                Hard Blocks: {stats?.hardBlocks || 0}
              </Badge>
              <Badge 
                variant="outline" 
                className="gap-1 text-warning border-warning/50"
              >
                <ShieldCheck className="w-3 h-3" />
                Overridable: {stats?.overridable || 0}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="gap-2"
              >
                <RefreshCw className={cn(
                  "w-4 h-4",
                  itemsLoading && "animate-spin"
                )} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as QAInboxTab)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="qa_failed" className="gap-2">
              <ShieldCheck className="w-4 h-4" />
              QA Failed ({stats?.overridable || 0})
            </TabsTrigger>
            <TabsTrigger value="hard_block" className="gap-2">
              <ShieldAlert className="w-4 h-4" />
              Hard Blocks ({stats?.hardBlocks || 0})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="pt-6">
            <QAInboxFilters
              vertical={vertical}
              onVerticalChange={setVertical}
              accountId={accountId}
              onAccountChange={setAccountId}
              search={search}
              onSearchChange={setSearch}
              accounts={accounts}
            />
          </CardContent>
        </Card>

        {/* Review Items */}
        <div className="space-y-3">
          {itemsLoading ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="glass-card p-4">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              </Card>
            ))
          ) : items.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-30 text-success" />
                <p className="text-lg font-medium text-success">All caught up!</p>
                <p className="text-sm">
                  {isHardBlockTab 
                    ? 'No hard-blocked scripts' 
                    : 'No scripts pending review'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            items.map((item) => (
              <QAReviewCard
                key={item.id}
                item={item}
                isHardBlock={isHardBlockTab}
                onRegenerate={() => handleRegenerate(item.account_id)}
                onOverride={(reason) => handleOverride(item.id, reason)}
                isRegenerating={regenerateMutation.isPending}
                isOverriding={overrideMutation.isPending}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
