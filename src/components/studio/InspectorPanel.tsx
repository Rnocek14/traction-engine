import { useState } from "react";
import { FileText, Video, ShieldCheck, ChevronRight, Save, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusInfo, hasHardBlocks } from "@/hooks/use-studio";
import { VideoGallery } from "./VideoGallery";
import { VoiceoverGenerator } from "./VoiceoverGenerator";
import type { Tables } from "@/integrations/supabase/types";
import type { ScriptEdits } from "@/hooks/use-studio-editor";
import type { StyleGuide } from "@/types/timeline-types";

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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  selectedVideoJobId: string | null;
  onSelectVideoJob: (jobId: string | null) => void;
  onPreviewVideo: (url: string) => void;
  versionChainIds: string[];
  styleGuide?: StyleGuide;
  onUpdateStyleGuide?: (guide: StyleGuide) => void;
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
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  selectedVideoJobId,
  onSelectVideoJob,
  onPreviewVideo,
  versionChainIds,
  styleGuide,
  onUpdateStyleGuide,
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
            {/* Undo/Redo + Save bar */}
            <div className="flex items-center justify-between p-2 rounded bg-secondary/20 border border-border/30 mb-3">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo (⌘Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo (⌘⇧Z)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              {isDirty ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-warning">
                    {dirtyCount} unsaved
                  </span>
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
                  </Button>
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground">No changes</span>
              )}
            </div>

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

            <Separator className="my-3 bg-border/30" />

            {/* TTS Generation */}
            <VoiceoverGenerator
              scriptId={script.id}
              voiceoverText={edits.voiceover}
              existingAudioUrl={(script as unknown as { voiceover_audio_url?: string }).voiceover_audio_url}
              existingVoice={(script as unknown as { voiceover_voice?: string }).voiceover_voice}
            />

            <Separator className="my-3 bg-border/30" />

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

          {/* Video Tab - Style Guide + Gallery */}
          <TabsContent value="video" className="m-0 p-4 space-y-4">
            {/* Style Guide Section */}
            <InspectorSection title="Style Guide" defaultOpen>
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground mb-2">
                  Define visual consistency for all generated clips
                </p>

                {/* Reference Image (for first-clip anchoring) */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Reference Image (anchors first clip)
                  </label>
                  <Input
                    value={styleGuide?.reference_image_url || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, reference_image_url: e.target.value })}
                    placeholder="https://... or paste image URL"
                    className="text-xs bg-secondary/30 border-border/30"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Upload your character/location image to anchor the visual style
                  </p>
                </div>

                <Separator className="bg-border/20" />
                
                {/* Character/Subject */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Subject/Character
                  </label>
                  <Input
                    value={styleGuide?.character || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, character: e.target.value })}
                    placeholder="e.g., elderly person with weathered hands, wedding ring"
                    className="text-xs bg-secondary/30 border-border/30"
                  />
                </div>

                {/* Wardrobe (new) */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Wardrobe
                  </label>
                  <Input
                    value={styleGuide?.wardrobe || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, wardrobe: e.target.value })}
                    placeholder="e.g., blue denim jacket, white t-shirt, silver watch"
                    className="text-xs bg-secondary/30 border-border/30"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Location
                  </label>
                  <Input
                    value={styleGuide?.location || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, location: e.target.value })}
                    placeholder="e.g., warm sunlit kitchen with wooden cabinets"
                    className="text-xs bg-secondary/30 border-border/30"
                  />
                </div>

                {/* Props (new) */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Key Props
                  </label>
                  <Input
                    value={styleGuide?.props || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, props: e.target.value })}
                    placeholder="e.g., vintage coffee mug, worn leather notebook"
                    className="text-xs bg-secondary/30 border-border/30"
                  />
                </div>

                <Separator className="bg-border/20" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cinematography</p>

                <div className="grid grid-cols-2 gap-2">
                  {/* Lens (new) */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Lens
                    </label>
                    <Select
                      value={styleGuide?.lens || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, lens: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24mm">24mm Wide</SelectItem>
                        <SelectItem value="35mm">35mm Standard</SelectItem>
                        <SelectItem value="50mm">50mm Natural</SelectItem>
                        <SelectItem value="85mm">85mm Portrait</SelectItem>
                        <SelectItem value="135mm">135mm Telephoto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Camera Style */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Camera Style
                    </label>
                    <Select
                      value={styleGuide?.camera_style || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, camera_style: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="documentary">Documentary</SelectItem>
                        <SelectItem value="cinematic">Cinematic</SelectItem>
                        <SelectItem value="vlog">Vlog style</SelectItem>
                        <SelectItem value="static">Static shots</SelectItem>
                        <SelectItem value="dynamic">Dynamic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Depth of Field (new) */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Depth of Field
                    </label>
                    <Select
                      value={styleGuide?.depth_of_field || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, depth_of_field: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shallow">Shallow (f/1.8-2.8)</SelectItem>
                        <SelectItem value="medium">Medium (f/4-5.6)</SelectItem>
                        <SelectItem value="deep">Deep (f/8-11)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Motion Style (new) */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Motion Style
                    </label>
                    <Select
                      value={styleGuide?.motion_style || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, motion_style: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smooth">Smooth/Stabilized</SelectItem>
                        <SelectItem value="handheld">Handheld</SelectItem>
                        <SelectItem value="static">Static/Locked</SelectItem>
                        <SelectItem value="tracking">Tracking</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="bg-border/20" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lighting & Color</p>

                <div className="grid grid-cols-2 gap-2">
                  {/* Time of Day (new) */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Time of Day
                    </label>
                    <Select
                      value={styleGuide?.time_of_day || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, time_of_day: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dawn">Dawn</SelectItem>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="midday">Midday</SelectItem>
                        <SelectItem value="golden_hour">Golden Hour</SelectItem>
                        <SelectItem value="dusk">Dusk</SelectItem>
                        <SelectItem value="night">Night</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Lighting */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Lighting
                    </label>
                    <Select
                      value={styleGuide?.lighting || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, lighting: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="natural">Natural daylight</SelectItem>
                        <SelectItem value="golden_hour">Golden hour</SelectItem>
                        <SelectItem value="studio">Studio</SelectItem>
                        <SelectItem value="dramatic">Dramatic</SelectItem>
                        <SelectItem value="soft">Soft diffused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Color Grade */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Color Grade
                    </label>
                    <Select
                      value={styleGuide?.color_grade || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, color_grade: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warm">Warm amber</SelectItem>
                        <SelectItem value="cool">Cool blue</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="vintage">Vintage film</SelectItem>
                        <SelectItem value="high_contrast">High contrast</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Film Stock (new) */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Film Stock
                    </label>
                    <Select
                      value={styleGuide?.film_stock || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, film_stock: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="digital">Clean Digital</SelectItem>
                        <SelectItem value="portra">Kodak Portra</SelectItem>
                        <SelectItem value="ektar">Kodak Ektar</SelectItem>
                        <SelectItem value="cinestill">CineStill 800T</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mood */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Mood
                    </label>
                    <Select
                      value={styleGuide?.mood || ""}
                      onValueChange={(v) => onUpdateStyleGuide?.({ ...styleGuide, mood: v })}
                    >
                      <SelectTrigger className="text-xs bg-secondary/30 border-border/30 h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hopeful">Hopeful</SelectItem>
                        <SelectItem value="dramatic">Dramatic</SelectItem>
                        <SelectItem value="calm">Calm</SelectItem>
                        <SelectItem value="energetic">Energetic</SelectItem>
                        <SelectItem value="intimate">Intimate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Custom Notes */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Custom Notes
                  </label>
                  <Textarea
                    value={styleGuide?.custom_notes || ""}
                    onChange={(e) => onUpdateStyleGuide?.({ ...styleGuide, custom_notes: e.target.value })}
                    placeholder="Additional style notes for consistency..."
                    className="text-xs bg-secondary/30 border-border/30 min-h-[60px] resize-y"
                  />
                </div>
              </div>
            </InspectorSection>

            <Separator className="bg-border/30" />

            {/* Video Gallery */}
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
