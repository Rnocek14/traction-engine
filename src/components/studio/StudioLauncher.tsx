import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;
type AccountConfig = Tables<"account_configs">;

interface StudioLauncherProps {
  onScriptCreated?: (scriptId: string) => void;
}

export function StudioLauncher({ onScriptCreated }: StudioLauncherProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedPillar, setSelectedPillar] = useState<string>("");
  const [mode, setMode] = useState<"ai" | "template">("ai");

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["account-configs"],
    queryFn: async (): Promise<AccountConfig[]> => {
      const { data, error } = await supabase
        .from("account_configs")
        .select("*")
        .order("account_id");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch recent scripts
  const { data: recentScripts = [], isLoading: scriptsLoading } = useQuery({
    queryKey: ["recent-scripts"],
    queryFn: async (): Promise<ScriptRun[]> => {
      const { data, error } = await supabase
        .from("script_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  // Get pillars for selected account
  const selectedAccountConfig = accounts.find(
    (a) => a.account_id === selectedAccount
  );
  const pillars = selectedAccountConfig?.content_pillars || [];

  // Generate script mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-script", {
        body: {
          account_id: selectedAccount,
          preferred_pillar: selectedPillar || undefined,
          mode,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Generation failed");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Script generated!",
        description: `Status: ${data.script_run?.status}`,
      });
      if (data.script_run?.id) {
        if (onScriptCreated) {
          onScriptCreated(data.script_run.id);
        } else {
          navigate(`/studio/${data.script_run.id}`);
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "qa_passed":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "qa_failed":
        return <XCircle className="h-4 w-4 text-warning" />;
      case "generating":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Generate New Script */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate New Script
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Account Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Account</label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.account_id} value={account.account_id}>
                      <div className="flex items-center gap-2">
                        <span>{account.account_id}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {account.vertical}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pillar Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Content Pillar</label>
              <Select
                value={selectedPillar}
                onValueChange={(val) => setSelectedPillar(val === "__any__" ? "" : val)}
                disabled={!selectedAccount}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any pillar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any pillar</SelectItem>
                  {pillars.map((pillar) => (
                    <SelectItem key={pillar} value={pillar}>
                      {pillar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mode Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode(v as "ai" | "template")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3" />
                      AI (GPT-4o)
                    </div>
                  </SelectItem>
                  <SelectItem value="template">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Template (Fast)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={!selectedAccount || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Script
              </>
            )}
          </Button>

          {selectedAccountConfig && (
            <p className="text-xs text-muted-foreground text-center">
              {selectedAccountConfig.promise}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Scripts */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Recent Scripts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scriptsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentScripts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No scripts yet. Generate your first one above!
            </p>
          ) : (
            <div className="space-y-2">
              {recentScripts.map((script) => {
                const content = script.script_content as Record<string, unknown> | null;
                const hook = (content?.hook as string) || "No hook";

                return (
                  <button
                    key={script.id}
                    onClick={() => navigate(`/studio/${script.id}`)}
                    className="w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {getStatusIcon(script.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{hook}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {script.account_id}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(script.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                      <Play className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
