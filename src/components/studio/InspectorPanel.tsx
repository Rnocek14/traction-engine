import { useState } from "react";
import { FileText, Video, ShieldCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getStatusInfo, hasHardBlocks } from "@/hooks/use-studio";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;

interface InspectorPanelProps {
  script: ScriptRun;
  className?: string;
}

/**
 * Tabbed inspector panel with Script/Video/QA sections.
 * Collapsible sections within each tab.
 */
export function InspectorPanel({ script, className }: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState("script");
  
  const content = script.script_content as Record<string, unknown> | null;
  const hook = (content?.hook as string) || "";
  const voiceover = (content?.voiceover as string) || "";
  const cta = (content?.cta as string) || "";
  const hashtags = (content?.hashtags as string[]) || [];
  const scenePrompts = (content?.scene_prompts as string[]) || [];

  const statusInfo = getStatusInfo(script);
  const isHardBlock = hasHardBlocks(script);

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
              "data-[state=active]:text-primary"
            )}
          >
            <FileText className="h-4 w-4 mr-2" />
            <span className="text-xs font-medium">Script</span>
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
          {/* Script Tab */}
          <TabsContent value="script" className="m-0 p-4 space-y-2">
            <InspectorSection title="Hook" count={`${hook.length} chars`}>
              <p className="text-sm leading-relaxed">{hook || "No hook content"}</p>
            </InspectorSection>

            <InspectorSection title="Voiceover" count={`${voiceover.split(/\s+/).filter(Boolean).length} words`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {voiceover || "No voiceover content"}
              </p>
            </InspectorSection>

            <InspectorSection title="Call to Action">
              <p className="text-sm">{cta || "No CTA"}</p>
            </InspectorSection>

            {hashtags.length > 0 && (
              <InspectorSection title="Hashtags" count={String(hashtags.length)}>
                <div className="flex flex-wrap gap-1">
                  {hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </InspectorSection>
            )}

            {scenePrompts.length > 0 && (
              <InspectorSection title="Scene Prompts" count={String(scenePrompts.length)}>
                <div className="space-y-1.5">
                  {scenePrompts.map((prompt, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-secondary/30 text-xs"
                    >
                      <span className="text-primary font-mono mr-2">
                        [{i + 1}]
                      </span>
                      <span className="text-muted-foreground">{prompt}</span>
                    </div>
                  ))}
                </div>
              </InspectorSection>
            )}
          </TabsContent>

          {/* Video Tab */}
          <TabsContent value="video" className="m-0 p-4">
            <div className="text-center py-8">
              <Video className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Video settings moved to action panel
              </p>
              <p className="text-xs text-muted-foreground">
                Use the panel below the preview to configure and generate videos
              </p>
            </div>
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

interface InspectorSectionProps {
  title: string;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function InspectorSection({ title, count, defaultOpen = true, children }: InspectorSectionProps) {
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
