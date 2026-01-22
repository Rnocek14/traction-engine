import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Sparkles, FileText, Wrench, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  useRegenerateFromStudio,
  buildConstraintFromFailure,
  type RegenPreset,
} from "@/hooks/use-regenerate-studio";
import { hasHardBlocks, type ScriptRun } from "@/hooks/use-studio";

interface StudioActionPanelProps {
  script: ScriptRun;
  isLoading?: boolean;
}

interface PresetButton {
  preset: RegenPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
  showWhen: 'always' | 'failed' | 'passed';
}

const PRESET_BUTTONS: PresetButton[] = [
  {
    preset: 'keep_topic',
    label: 'Keep Topic',
    description: 'Regenerate with same topic & pillar',
    icon: <RefreshCw className="h-4 w-4" />,
    showWhen: 'always',
  },
  {
    preset: 'new_topic_same_pillar',
    label: 'New Topic',
    description: 'Pick a fresh topic from same pillar',
    icon: <Sparkles className="h-4 w-4" />,
    showWhen: 'always',
  },
  {
    preset: 'fix_flags',
    label: 'Fix Flagged Issues',
    description: 'AI guided to avoid previous errors',
    icon: <Wrench className="h-4 w-4" />,
    showWhen: 'failed',
  },
  {
    preset: 'template_keep_topic',
    label: 'Template Mode',
    description: 'Fast generation without AI',
    icon: <FileText className="h-4 w-4" />,
    showWhen: 'always',
  },
];

export function StudioActionPanel({ script, isLoading }: StudioActionPanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const regenerateMutation = useRegenerateFromStudio();
  const [activePreset, setActivePreset] = useState<RegenPreset | null>(null);

  const isHardBlock = hasHardBlocks(script);
  const isFailed = script.status === 'qa_failed';
  const isPassed = script.status === 'qa_passed';

  const handleRegenerate = async (preset: RegenPreset) => {
    setActivePreset(preset);

    try {
      // Build constraint for fix_flags preset
      const constraint = preset === 'fix_flags' ? buildConstraintFromFailure(script) : undefined;

      const result = await regenerateMutation.mutateAsync({
        scriptId: script.id,
        preset,
        constraint,
      });

      toast({
        title: "Regeneration started",
        description: `Request ID: ${result.request_id.slice(0, 8)}...`,
      });

      // Navigate to the new script
      if (result.script_run?.id) {
        navigate(`/studio/${result.script_run.id}`);
      }
    } catch (error) {
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActivePreset(null);
    }
  };

  const isAnyLoading = regenerateMutation.isPending || isLoading;

  // Filter presets based on script status
  const visiblePresets = PRESET_BUTTONS.filter((btn) => {
    if (btn.showWhen === 'always') return true;
    if (btn.showWhen === 'failed') return isFailed || isHardBlock;
    if (btn.showWhen === 'passed') return isPassed;
    return true;
  });

  return (
    <Card className="glass-card sticky top-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Regenerate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isHardBlock && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded mb-3">
            Hard block detected — regeneration required
          </div>
        )}

        {visiblePresets.map((btn) => (
          <Button
            key={btn.preset}
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            disabled={isAnyLoading}
            onClick={() => handleRegenerate(btn.preset)}
          >
            {activePreset === btn.preset ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              btn.icon
            )}
            <div className="text-left">
              <div className="font-medium">{btn.label}</div>
              <div className="text-xs text-muted-foreground">{btn.description}</div>
            </div>
          </Button>
        ))}

        <Separator className="my-4" />

        {/* Video Queue - placeholder for Phase 5 */}
        <div className="opacity-50">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            disabled
          >
            <Video className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">Queue Video</div>
              <div className="text-xs text-muted-foreground">
                {isPassed ? "Ready for video generation" : "Requires QA passed status"}
              </div>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
