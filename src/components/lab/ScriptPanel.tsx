import { useState } from "react";
import { FileText, Copy, Check, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ScriptPanelProps {
  className?: string;
  onScriptGenerated?: (script: string, voiceover: string) => void;
}

type ScriptPreset = "luna" | "educational" | "story" | "hook";

const PRESETS: { id: ScriptPreset; name: string; description: string; template: string }[] = [
  { 
    id: "luna", 
    name: "Luna Tone", 
    description: "Warm, conversational persona",
    template: "You know what nobody talks about? [Topic]. Here's what I learned after [experience]..."
  },
  { 
    id: "educational", 
    name: "Educational", 
    description: "Clear, informative style",
    template: "Let me explain [Topic] in simple terms. First, [point 1]. Second, [point 2]. The key takeaway is..."
  },
  { 
    id: "story", 
    name: "Story", 
    description: "Narrative, engaging format",
    template: "It was 3am when I realized [discovery]. This changed everything about how I think about [topic]..."
  },
  { 
    id: "hook", 
    name: "Hook Only", 
    description: "Short, attention-grabbing",
    template: "Stop scrolling. This will save you [benefit]."
  },
];

export function ScriptPanel({ className, onScriptGenerated }: ScriptPanelProps) {
  const [preset, setPreset] = useState<ScriptPreset>("luna");
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyTemplate = () => {
    const template = PRESETS.find(p => p.id === preset)?.template || "";
    setScript(template);
    onScriptGenerated?.(template, template);
  };

  const handleScriptChange = (value: string) => {
    setScript(value);
    onScriptGenerated?.(value, value);
  };

  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5);

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Script Editor
          </span>
        </div>
        {script && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {/* Preset Selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Template Presets</Label>
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
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-7 text-xs"
          onClick={handleApplyTemplate}
        >
          <Wand2 className="h-3 w-3 mr-1" />
          Apply Template
        </Button>
      </div>

      {/* Script Editor */}
      <div className="space-y-2 flex-1">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Script / Voiceover</Label>
          <div className="flex gap-1">
            <Badge variant="outline" className="h-5 text-[10px]">
              {wordCount} words
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px]">
              ~{estimatedDuration}s
            </Badge>
          </div>
        </div>
        <Textarea
          value={script}
          onChange={(e) => handleScriptChange(e.target.value)}
          placeholder="Write your script here, or apply a template above..."
          className="text-xs bg-secondary/30 border-border/30 min-h-[150px] resize-none flex-1"
        />
      </div>

      {/* Tip */}
      <p className="text-[10px] text-muted-foreground">
        💡 This is manual mode - write or paste your script. AI generation requires auth.
      </p>
    </div>
  );
}
