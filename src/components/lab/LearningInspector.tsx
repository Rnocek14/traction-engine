import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Sparkles,
  Camera,
  Sun,
  Zap,
  Cloud,
  Heart,
  Tag,
  Clock,
  User,
  Bot,
  Users
} from "lucide-react";
import { 
  usePromptLearnings, 
  useProviderStats, 
  calculateEffectiveScore,
  type Provider,
  type PatternLearning 
} from "@/hooks/use-prompt-learnings";
import { cn } from "@/lib/utils";

const PATTERN_ICONS: Record<string, React.ReactNode> = {
  camera: <Camera className="h-3 w-3" />,
  lighting: <Sun className="h-3 w-3" />,
  motion: <Zap className="h-3 w-3" />,
  environment: <Cloud className="h-3 w-3" />,
  mood: <Heart className="h-3 w-3" />,
  subject: <Brain className="h-3 w-3" />,
  semantic_trait: <Sparkles className="h-3 w-3" />,
  style_hint: <Tag className="h-3 w-3" />,
};

const PROVIDER_COLORS: Record<string, string> = {
  sora: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  runway: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  luma: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const SOURCE_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  human: { icon: <User className="h-3 w-3" />, label: "Human", className: "bg-primary/20 text-primary border-primary/30" },
  auto: { icon: <Bot className="h-3 w-3" />, label: "Auto", className: "bg-chart-4/20 text-chart-4 border-chart-4/30" },
  mixed: { icon: <Users className="h-3 w-3" />, label: "Mixed", className: "bg-secondary text-secondary-foreground border-border" },
};

function PatternRow({ pattern }: { pattern: PatternLearning & { effectiveScore: number } }) {
  const successRate = pattern.total_uses > 0 
    ? (pattern.successful_uses / pattern.total_uses) * 100 
    : 0;

  const daysSinceSuccess = pattern.last_success_at 
    ? Math.floor((Date.now() - new Date(pattern.last_success_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Determine source badge
  const source = pattern.learning_source || "human";
  const sourceConfig = SOURCE_CONFIG[source] || SOURCE_CONFIG.human;

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
      pattern.avoid_pattern 
        ? "bg-destructive/10 border-destructive/30" 
        : "bg-muted/30 border-border/50 hover:bg-muted/50"
    )}>
      {/* Pattern type icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        {PATTERN_ICONS[pattern.pattern_type] || <Tag className="h-3 w-3" />}
      </div>

      {/* Pattern info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{pattern.pattern_value}</span>
          {pattern.avoid_pattern && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              AVOID
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <span className="capitalize">{pattern.pattern_type.replace("_", " ")}</span>
          <span className={PROVIDER_COLORS[pattern.provider]}>
            {pattern.provider}
          </span>
          {/* Source badge */}
          <Badge variant="outline" className={cn("text-[9px] h-4 px-1 gap-0.5", sourceConfig.className)}>
            {sourceConfig.icon}
            {sourceConfig.label}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs">
        {/* Effective Score */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className="text-center">
                <div className="font-mono font-bold text-primary">
                  {pattern.effectiveScore.toFixed(1)}
                </div>
                <div className="text-muted-foreground">score</div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Effective Score = rating × log(uses) × time_decay</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Success/Fail counts */}
        <div className="text-center">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-chart-2" />
            <span className="font-mono">{pattern.successful_uses}</span>
            <span className="text-muted-foreground">/</span>
            <TrendingDown className="h-3 w-3 text-destructive" />
            <span className="font-mono">{pattern.failed_uses}</span>
          </div>
          <div className="text-muted-foreground">uses</div>
        </div>

        {/* Average Rating */}
        <div className="text-center">
          <div className="font-mono font-bold text-chart-2">
            {pattern.average_rating?.toFixed(1) || "-"}/5
          </div>
          <div className="text-muted-foreground">rating</div>
        </div>

        {/* Days since success */}
        {daysSinceSuccess !== null && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{daysSinceSuccess}d</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Days since last success (affects time decay)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Success rate bar */}
      <div className="w-24">
        <Progress 
          value={successRate} 
          className="h-2"
        />
        <div className="text-xs text-center text-muted-foreground mt-1">
          {successRate.toFixed(0)}% success
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ stats }: { stats: { provider: string; total_patterns: number; avoided_count: number; avg_rating: number; total_successes: number; total_failures: number } }) {
  const totalUses = stats.total_successes + stats.total_failures;
  const successRate = totalUses > 0 ? (stats.total_successes / totalUses) * 100 : 0;

  return (
    <Card className={cn("border", PROVIDER_COLORS[stats.provider])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg capitalize">{stats.provider}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-2xl font-bold">{stats.total_patterns}</div>
            <div className="text-xs text-muted-foreground">patterns</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.avg_rating.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">avg rating</div>
          </div>
        </div>
        
        <Progress value={successRate} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{stats.total_successes} successes</span>
          <span>{stats.total_failures} failures</span>
        </div>
        
        {stats.avoided_count > 0 && (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {stats.avoided_count} avoided
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export function LearningInspector() {
  const [selectedProvider, setSelectedProvider] = useState<Provider>("all");
  const { data: patterns, isLoading } = usePromptLearnings(selectedProvider);
  const { data: providerStats } = useProviderStats();

  const positivePatterns = patterns?.filter(p => !p.avoid_pattern) || [];
  const avoidPatterns = patterns?.filter(p => p.avoid_pattern) || [];
  const semanticTraits = patterns?.filter(p => p.pattern_type === "semantic_trait") || [];

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Learning Inspector</h2>
        </div>
        
        <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as Provider)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="sora">Sora</SelectItem>
            <SelectItem value="runway">Runway</SelectItem>
            <SelectItem value="luma">Luma</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Provider Stats Cards */}
      {providerStats && providerStats.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {providerStats.map(stats => (
            <ProviderCard key={stats.provider} stats={stats} />
          ))}
        </div>
      )}

      {/* Pattern Tabs */}
      <Tabs defaultValue="positive" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="positive" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Learned ({positivePatterns.length})
          </TabsTrigger>
          <TabsTrigger value="avoid" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Avoid ({avoidPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="semantic" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Semantic ({semanticTraits.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positive" className="flex-1 min-h-0 mt-4">
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-4">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-8">Loading patterns...</div>
              ) : positivePatterns.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No learned patterns yet. Rate some videos to start learning!
                </div>
              ) : (
                positivePatterns.map(pattern => (
                  <PatternRow key={pattern.id} pattern={pattern} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="avoid" className="flex-1 min-h-0 mt-4">
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-4">
              {avoidPatterns.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No avoid patterns yet. Patterns with {">"} 60% failure rate will appear here.
                </div>
              ) : (
                avoidPatterns.map(pattern => (
                  <PatternRow key={pattern.id} pattern={pattern} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="semantic" className="flex-1 min-h-0 mt-4">
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-4">
              {semanticTraits.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No semantic traits learned yet. These are high-level concepts extracted from successful prompts.
                </div>
              ) : (
                semanticTraits.map(pattern => (
                  <PatternRow key={pattern.id} pattern={pattern} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
