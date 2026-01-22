import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import { 
  createScriptRun,
  listAccountConfigs,
  listAvailablePillars,
  type DbAccountConfig,
  type ScriptRunResult,
} from "@/lib/script-runs";
import type { ScriptContent, QAResult } from "@/types/script-types";

// Local result type for UI display
interface DisplayResult {
  success: boolean;
  scriptRun?: {
    id: string;
    account_id: string;
    status: string;
    script_content: ScriptContent;
    hook_hash?: string | null;
    voiceover_hash?: string | null;
    scene_hash?: string | null;
    safety_flags: string[];
  };
  qaResult?: QAResult;
  error?: string;
  warnings: string[];
}

export default function ScriptGenerator() {
  const [accounts, setAccounts] = useState<DbAccountConfig[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [availablePillars, setAvailablePillars] = useState<string[]>([]);
  const [selectedPillar, setSelectedPillar] = useState<string>("");
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [useAI, setUseAI] = useState(true);

  // Load accounts from DB on mount
  useEffect(() => {
    listAccountConfigs().then(setAccounts);
  }, []);

  // Load pillars when account changes
  useEffect(() => {
    if (selectedAccount) {
      const account = accounts.find(a => a.account_id === selectedAccount);
      if (account) {
        listAvailablePillars(account.vertical).then(setAvailablePillars);
      }
    } else {
      setAvailablePillars([]);
    }
    setSelectedPillar("");
  }, [selectedAccount, accounts]);

  const handleGenerate = useCallback(async (count: number) => {
    if (!selectedAccount) return;
    
    setIsGenerating(true);
    
    try {
      const mode = useAI ? 'ai' : 'template';
      
      for (let i = 0; i < count; i++) {
        const result: ScriptRunResult = await createScriptRun({
          accountId: selectedAccount,
          preferredPillar: selectedPillar || undefined,
          mode,
        });
        
        // Map to display result
        const displayResult: DisplayResult = {
          success: result.success,
          error: result.error,
          warnings: result.warnings,
        };
        
        if (result.scriptRun) {
          displayResult.scriptRun = {
            id: result.scriptRun.id,
            account_id: result.scriptRun.account_id,
            status: result.scriptRun.status,
            script_content: result.scriptRun.script_content as unknown as ScriptContent,
            hook_hash: result.scriptRun.hook_hash,
            voiceover_hash: result.scriptRun.voiceover_hash,
            scene_hash: result.scriptRun.scene_hash,
            safety_flags: result.scriptRun.safety_flags,
          };
          displayResult.qaResult = result.scriptRun.qa_results as unknown as QAResult;
        }
        
        setResults(prev => [displayResult, ...prev]);
      }
    } catch (error) {
      console.error("Generation error:", error);
      setResults(prev => [{
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        warnings: [],
      }, ...prev]);
    }
    
    setIsGenerating(false);
  }, [selectedAccount, selectedPillar, useAI]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const stats = {
    total: results.length,
    passed: results.filter(r => r.scriptRun?.status === "qa_passed").length,
    failed: results.filter(r => r.scriptRun?.status === "qa_failed").length,
    errors: results.filter(r => !r.success).length,
  };

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
                <h1 className="text-xl font-semibold">Script Generator</h1>
                <p className="text-sm text-muted-foreground">
                  Generate QA-gated scripts for content pipeline
                </p>
              </div>
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-mono font-medium">{stats.total}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="font-mono font-medium text-success">{stats.passed}</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="font-mono font-medium text-destructive">{stats.failed}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Generator Controls */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Generate Scripts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              {/* Account Selector */}
              <div className="space-y-2 min-w-[200px]">
                <label className="text-sm text-muted-foreground">Account</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(config => (
                      <SelectItem key={config.account_id} value={config.account_id}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {config.vertical}
                          </Badge>
                          <span>{config.account_id}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pillar Selector */}
              <div className="space-y-2 min-w-[200px]">
                <label className="text-sm text-muted-foreground">Pillar (optional)</label>
                <Select 
                  value={selectedPillar || "__any__"} 
                  onValueChange={(val) => setSelectedPillar(val === "__any__" ? "" : val)}
                  disabled={!selectedAccount}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any pillar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any pillar</SelectItem>
                    {availablePillars.map(pillar => (
                      <SelectItem key={pillar} value={pillar}>
                        {pillar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Toggle */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-2">
                  {useAI ? (
                    <Sparkles className="w-4 h-4 text-primary" />
                  ) : (
                    <Zap className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {useAI ? "GPT-4" : "Templates"}
                  </span>
                </div>
                <Switch 
                  checked={useAI} 
                  onCheckedChange={setUseAI}
                />
              </div>

              {/* Generate Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleGenerate(1)}
                  disabled={!selectedAccount || isGenerating}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : useAI ? (
                    <Sparkles className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Generate 1
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleGenerate(5)}
                  disabled={!selectedAccount || isGenerating}
                  className="gap-2"
                >
                  Generate 5
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Generated Scripts</h2>
          
          {results.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No scripts generated yet</p>
                <p className="text-sm">Select an account and click Generate to start</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {results.map((result, index) => (
                <ScriptResultCard
                  key={result.scriptRun?.id || `error-${index}`}
                  result={result}
                  isExpanded={expandedIds.has(result.scriptRun?.id || `error-${index}`)}
                  onToggle={() => toggleExpanded(result.scriptRun?.id || `error-${index}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ScriptResultCard({ 
  result, 
  isExpanded, 
  onToggle 
}: { 
  result: GenerationResult; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  const status = result.success 
    ? result.scriptRun?.status 
    : "error";

  const statusConfig = {
    qa_passed: { 
      icon: CheckCircle, 
      color: "text-success", 
      bg: "bg-success/10",
      label: "QA Passed"
    },
    qa_failed: { 
      icon: XCircle, 
      color: "text-destructive", 
      bg: "bg-destructive/10",
      label: "QA Failed"
    },
    error: { 
      icon: AlertTriangle, 
      color: "text-warning", 
      bg: "bg-warning/10",
      label: "Error"
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.error;
  const Icon = config.icon;

  return (
    <Card className={cn("glass-card overflow-hidden", config.bg)}>
      <div 
        className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={cn("w-5 h-5", config.color)} />
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{config.label}</Badge>
                {result.scriptRun && (
                  <span className="text-sm text-muted-foreground">
                    Account: {result.scriptRun.account_id}
                  </span>
                )}
              </div>
              {result.scriptRun?.script_content && (
                <p className="text-sm mt-1 line-clamp-1">
                  {result.scriptRun.script_content.hook}
                </p>
              )}
              {result.error && (
                <p className="text-sm text-destructive mt-1">{result.error}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {result.warnings.length > 0 && (
              <Badge variant="outline" className="text-warning border-warning/50">
                {result.warnings.length} warnings
              </Badge>
            )}
            {result.qaResult?.errors && result.qaResult.errors.length > 0 && (
              <Badge variant="outline" className="text-destructive border-destructive/50">
                {result.qaResult.errors.length} errors
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && result.scriptRun && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {/* QA Results */}
          {result.qaResult && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">QA Checks</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {Object.entries(result.qaResult.checks).map(([key, passed]) => (
                  <div key={key} className="flex items-center gap-2">
                    {passed ? (
                      <CheckCircle className="w-3 h-3 text-success" />
                    ) : (
                      <XCircle className="w-3 h-3 text-destructive" />
                    )}
                    <span className="text-muted-foreground">
                      {key.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
              
              {result.qaResult.errors.length > 0 && (
                <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {result.qaResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {/* Safety Flags */}
          {result.scriptRun.safety_flags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Safety Flags</h4>
              <div className="flex flex-wrap gap-2">
                {result.scriptRun.safety_flags.map((flag, i) => (
                  <Badge key={i} variant="outline" className="text-warning border-warning/50">
                    {flag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Script Content */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Script Content</h4>
            <ScriptContentView content={result.scriptRun.script_content} />
          </div>
          
          {/* Fingerprints */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Fingerprints</h4>
            <div className="flex gap-4 text-xs font-mono text-muted-foreground">
              <span>Hook: {result.scriptRun.hook_hash?.substring(0, 8)}</span>
              <span>Voice: {result.scriptRun.voiceover_hash?.substring(0, 8)}</span>
              <span>Scene: {result.scriptRun.scene_hash?.substring(0, 8)}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ScriptContentView({ content }: { content: ScriptContent }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <span className="text-muted-foreground">Hook:</span>
        <p className="font-medium text-primary">{content.hook}</p>
      </div>
      
      <div>
        <span className="text-muted-foreground">Voiceover:</span>
        <p className="text-foreground whitespace-pre-wrap">{content.voiceover}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-muted-foreground">Scene Prompts:</span>
          <ul className="list-disc list-inside text-xs mt-1">
            {content.scene_prompts.map((prompt, i) => (
              <li key={i}>{prompt}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="text-muted-foreground">Hashtags:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {content.hashtags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex gap-4">
        <div>
          <span className="text-muted-foreground">CTA:</span>
          <p className="text-foreground">{content.cta}</p>
        </div>
        {content.disclaimer && (
          <div>
            <span className="text-muted-foreground">Disclaimer:</span>
            <p className="text-warning text-xs">{content.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
