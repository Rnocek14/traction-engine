import { useState, useCallback } from "react";
import { FileText, Video, ShieldCheck, ChevronRight, Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getStatusInfo, hasHardBlocks } from "@/hooks/use-studio";
import { VideoGallery } from "./VideoGallery";
import type { Tables } from "@/integrations/supabase/types";
import type { ScriptEdits } from "@/hooks/use-studio-editor";

type ScriptRun = Tables<"script_runs">;

interface InspectorPanelProps {
  script: ScriptRun;
  edits: ScriptEdits;
  dirtyFields: Record<keyof ScriptEdits, boolean>;
  isDirty: boolean;
  isSaving: boolean;
  onUpdateField: <K extends keyof ScriptEdits>(field: K, value: ScriptEdits[K]) => void;
  onSave: () => void;
  onReset: () => void;
  selectedVideoJobId: string | null;
  onSelectVideoJob: (jobId: string | null) => void;
  onPreviewVideo: (url: string) => void;
  versionChainIds: string[];
  className?: string;
}

/**
 * Tabbed inspector panel with editable Script/Video/QA sections.
 * Supports inline editing with dirty state tracking.
 */
export function InspectorPanel({
  script,
  edits,
  dirtyFields,
  isDirty,
  isSaving,
  onUpdateField,
  onSave,
  onReset,
  selectedVideoJobId,
  onSelectVideoJob,
  onPreviewVideo,
  versionChainIds,
  className,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState("script");

  const statusInfo = getStatusInfo(script);
  const isHardBlock = hasHardBlocks(script);

  // Count dirty fields for badge
  const dirtyCount = Object.values(dirtyFields).filter(Boolean).length;

  return (
    <div className={cn(
      "bg-[hsl(222_47%_6%)] rounded-lg border border-border/30",
      "flex flex-col h-full",
      className
    )}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        {/* Tab headers */}
        <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent p-0">
          <TabsTrigger
            value="script"
            className={cn(
              "rounded-none border-b-2 border-transparent px-4 py-2.5",
              "data-[state=active]:border-primary data-[state=active]:bg-transparent",
              "data-[state=active]:text-primary",
              "flex items-center gap-2"
            )}
          >
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium">Script</span>
            {dirtyCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="video"
            className={cn(
              "rounded-none border-b-2 border-transparent px-4 py-2.5",
              "data-[state=active]:border-primary data-[state=active]:bg-transparent",
              "data-[state=active]:text-primary"
            )}
          >
            <Video className="h-4 w-4 mr-2" />
            <span className="text-xs font-medium">Video</span>
          </TabsTrigger>
          <TabsTrigger
            value="qa"
            className={cn(
              "rounded-none border-b-2 border-transparent px-4 py-2.5",
              "data-[state=active]:border-primary data-[state=active]:bg-transparent",
              "data-[state=active]:text-primary",
              isHardBlock && "text-destructive"
            )}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            <span className="text-xs font-medium">QA</span>
            {isHardBlock && (
              <span className="ml-1 w-2 h-2 rounded-full bg-destructive animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Script Tab - Editable */}
          <TabsContent value="script" className="m-0 p-4 space-y-2">
            {/* Save/Reset bar when dirty */}
            {isDirty && (
              <div className="flex items-center justify-between p-2 rounded bg-warning/10 border border-warning/30 mb-3">
                <span className="text-xs text-warning">
                  {dirtyCount} unsaved change{dirtyCount > 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onReset}
                    disabled={isSaving}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onSave}
                    disabled={isSaving}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                    <kbd className="ml-2 px-1 py-0.5 bg-primary-foreground/20 rounded text-[9px]">
                      ⌘S
                    </kbd>
                  </Button>
                </div>
              </div>
            )}

            <EditableSection
              title="Hook"
              count={`${edits.hook.length} chars`}
              isDirty={dirtyFields.hook}
            >
              <Input
                value={edits.hook}
                onChange={(e) => onUpdateField("hook", e.target.value)}
                placeholder="Enter hook..."
                className="text-sm bg-secondary/30 border-border/30"
              />
            </EditableSection>

            <EditableSection
              title="Voiceover"
              count={`${edits.voiceover.split(/\s+/).filter(Boolean).length} words`}
              isDirty={dirtyFields.voiceover}
            >
              <Textarea
                value={edits.voiceover}
                onChange={(e) => onUpdateField("voiceover", e.target.value)}
                placeholder="Enter voiceover..."
                className="text-sm bg-secondary/30 border-border/30 min-h-[120px] resize-y"
              />
            </EditableSection>

            <EditableSection
              title="Call to Action"
              isDirty={dirtyFields.cta}
            >
              <Input
                value={edits.cta}
                onChange={(e) => onUpdateField("cta", e.target.value)}
                placeholder="Enter CTA..."
                className="text-sm bg-secondary/30 border-border/30"
              />
            </EditableSection>

            <EditableSection
              title="Hashtags"
              count={String(edits.hashtags.length)}
              isDirty={dirtyFields.hashtags}
            >
              <HashtagEditor
                hashtags={edits.hashtags}
                onChange={(tags) => onUpdateField("hashtags", tags)}
              />
            </EditableSection>

            <EditableSection
              title="Scene Prompts"
              count={String(edits.scene_prompts.length)}
              isDirty={dirtyFields.scene_prompts}
            >
              <div className="space-y-1.5">
                {edits.scene_prompts.map((prompt, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded bg-secondary/30 text-xs"
                  >
                    <span className="text-primary font-mono shrink-0">
                      [{i + 1}]
                    </span>
                    <Textarea
                      value={prompt}
                      onChange={(e) => {
                        const newPrompts = [...edits.scene_prompts];
                        newPrompts[i] = e.target.value;
                        onUpdateField("scene_prompts", newPrompts);
                      }}
                      className="flex-1 text-xs bg-transparent border-0 p-0 min-h-[40px] resize-none focus-visible:ring-0"
                      placeholder="Scene prompt..."
                    />
                  </div>
                ))}
              </div>
            </EditableSection>
          </TabsContent>

          {/* Video Tab - Gallery */}
          <TabsContent value="video" className="m-0 p-4">
            <VideoGallery
              scriptId={script.id}
              versionChainIds={versionChainIds}
              selectedJobId={selectedVideoJobId}
              onSelectJob={onSelectVideoJob}
              onPreviewVideo={onPreviewVideo}
            />
          </TabsContent>

          {/* QA Tab */}
          <TabsContent value="qa" className="m-0 p-4 space-y-4">
            {/* Status */}
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  statusInfo.variant === "destructive"
                    ? "destructive"
                    : "outline"
                }
                className={cn(
                  statusInfo.variant === "success" &&
                    "bg-success text-success-foreground",
                  statusInfo.variant === "warning" &&
                    "bg-warning/20 text-warning border-warning/30"
                )}
              >
                {statusInfo.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {statusInfo.description}
              </span>
            </div>

            {/* Edited warning */}
            {script.draft_edits && (
              <div className="p-2 rounded bg-warning/10 border border-warning/30">
                <p className="text-xs text-warning">
                  ⚠️ This script was edited after generation
                </p>
              </div>
            )}

            {/* Flags */}
            {(script.hard_block_flags?.length > 0 || script.safety_flags?.length > 0) && (
              <InspectorSection title="Flags" defaultOpen>
                <div className="space-y-2">
                  {script.hard_block_flags?.map((flag, i) => (
                    <div
                      key={`hb-${i}`}
                      className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30"
                    >
                      <span className="w-2 h-2 rounded-full bg-destructive" />
                      <span className="text-xs text-destructive">{flag}</span>
                    </div>
                  ))}
                  {script.safety_flags?.map((flag, i) => (
                    <div
                      key={`sf-${i}`}
                      className="flex items-center gap-2 p-2 rounded bg-warning/10 border border-warning/30"
                    >
                      <span className="w-2 h-2 rounded-full bg-warning" />
                      <span className="text-xs text-warning">{flag}</span>
                    </div>
                  ))}
                </div>
              </InspectorSection>
            )}

            {/* QA Results JSON */}
            {script.qa_results && (
              <InspectorSection title="QA Results">
                <pre className="text-xs text-muted-foreground overflow-auto max-h-48 p-2 rounded bg-secondary/30 font-mono">
                  {JSON.stringify(script.qa_results, null, 2)}
                </pre>
              </InspectorSection>
            )}

            {/* Override info */}
            {script.qa_override_at && (
              <InspectorSection title="Override">
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">By:</span> {script.qa_override_by}</p>
                  <p><span className="text-muted-foreground">At:</span> {new Date(script.qa_override_at).toLocaleString()}</p>
                  {script.qa_override_reason && (
                    <p><span className="text-muted-foreground">Reason:</span> {script.qa_override_reason}</p>
                  )}
                </div>
              </InspectorSection>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

interface EditableSectionProps {
  title: string;
  count?: string;
  isDirty?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function EditableSection({ title, count, isDirty, defaultOpen = true, children }: EditableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-secondary/30 rounded px-2 -mx-2 transition-colors">
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        )}
        {count && (
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            {count}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-3 px-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function InspectorSection({ title, defaultOpen = true, children }: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-secondary/30 rounded px-2 -mx-2 transition-colors">
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-3 px-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface HashtagEditorProps {
  hashtags: string[];
  onChange: (hashtags: string[]) => void;
}

function HashtagEditor({ hashtags, onChange }: HashtagEditorProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = inputValue.trim().replace(/^#/, "");
      if (tag && !hashtags.includes(tag)) {
        onChange([...hashtags, tag]);
        setInputValue("");
      }
    } else if (e.key === "Backspace" && !inputValue && hashtags.length > 0) {
      onChange(hashtags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(hashtags.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded bg-secondary/30 border border-border/30 min-h-[40px]">
      {hashtags.map((tag, i) => (
        <Badge
          key={i}
          variant="secondary"
          className="text-xs cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors"
          onClick={() => removeTag(i)}
        >
          #{tag}
          <span className="ml-1 opacity-50">×</span>
        </Badge>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={hashtags.length === 0 ? "Add hashtags..." : ""}
        className="flex-1 min-w-[80px] bg-transparent border-0 text-xs focus:outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
