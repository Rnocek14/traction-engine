import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ScriptPanelProps {
  className?: string;
  onScriptGenerated?: (script: string, voiceover: string) => void;
}

type ScriptPreset = "luna" | "educational" | "story" | "hook";

const PRESETS: { id: ScriptPreset; name: string; description: string }[] = [
  { id: "luna", name: "Luna Tone", description: "Warm, conversational persona" },
  { id: "educational", name: "Educational", description: "Clear, informative style" },
  { id: "story", name: "Story", description: "Narrative, engaging format" },
  { id: "hook", name: "Hook Only", description: "Short, attention-grabbing" },
];

export function ScriptPanel({ className, onScriptGenerated }: ScriptPanelProps) {
  const { toast } = useToast();

  const [preset, setPreset] = useState<ScriptPreset>("luna");
  const [topic, setTopic] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedVoiceover, setGeneratedVoiceover] = useState("");
  const [copied, setCopied] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      // For Lab testing, we use a simplified script generation
      // In production this would use the full generate-script edge function
      const { data, error } = await supabase.functions.invoke("generate-script", {
        body: {
          topic: topic || "A fascinating discovery",
          preset,
          lab_mode: true, // Signal this is a Lab test
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({
          title: "Script generation failed",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const script = data.script_content || data.script || "";
      const voiceover = data.voiceover || script;

      setGeneratedScript(typeof script === "string" ? script : JSON.stringify(script, null, 2));
      setGeneratedVoiceover(voiceover);
      onScriptGenerated?.(script, voiceover);

      toast({
        title: "Script generated",
        description: `${preset} preset • ${voiceover.split(/\s+/).length} words`,
      });
    },
    onError: (error) => {
      toast({
        title: "Script generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedVoiceover || generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = (generatedVoiceover || generatedScript).split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5);

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Script Generation
          </span>
        </div>
        {generatedScript && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {/* Preset Selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Style Preset</Label>
        <RadioGroup
          value={preset}
          onValueChange={(v) => setPreset(v as ScriptPreset)}
          className="grid grid-cols-2 gap-2"
        >
          {PRESETS.map(p => (
            <div
              key={p.id}
              className={cn(
                "flex items-center space-x-2 p-2 rounded border cursor-pointer transition-colors",
                preset === p.id 
                  ? "border-primary bg-primary/10" 
                  : "border-border/30 hover:border-border"
              )}
              onClick={() => setPreset(p.id)}
            >
              <RadioGroupItem value={p.id} id={p.id} />
              <div className="flex-1 min-w-0">
                <Label htmlFor={p.id} className="text-xs font-medium cursor-pointer">
                  {p.name}
                </Label>
                <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Topic Input */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Topic / Prompt</Label>
        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should the script be about? (optional)"
          className="text-xs bg-secondary/30 border-border/30 min-h-[60px] resize-none"
        />
      </div>

      {/* Generate Button */}
      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        className="w-full"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with {PRESETS.find(p => p.id === preset)?.name}
          </>
        )}
      </Button>

      {/* Output */}
      {generatedScript && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Generated Script</Label>
            <div className="flex gap-1">
              <Badge variant="outline" className="h-5 text-[10px]">
                {wordCount} words
              </Badge>
              <Badge variant="outline" className="h-5 text-[10px]">
                ~{estimatedDuration}s
              </Badge>
            </div>
          </div>
          
          <div className="rounded-lg border bg-secondary/20 p-3 max-h-[200px] overflow-y-auto">
            <p className="text-xs whitespace-pre-wrap">
              {generatedVoiceover || generatedScript}
            </p>
          </div>

          {/* Scene beats if available */}
          {typeof generatedScript === "object" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Scene Beats</Label>
              <pre className="text-[10px] text-muted-foreground bg-secondary/30 p-2 rounded overflow-x-auto">
                {JSON.stringify(generatedScript, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
