import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Beaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScriptPanel } from "@/components/lab/ScriptPanel";
import { VoicePanel } from "@/components/lab/VoicePanel";
import { VisualPanel } from "@/components/lab/VisualPanel";
import { AssemblyPanel } from "@/components/lab/AssemblyPanel";
import { VideoEngine } from "@/lib/lab-engines";

/**
 * Video Lab - R&D Sandbox for Engine Testing
 * 
 * This is NOT the production Studio. This is a chaos-allowed sandbox
 * for testing each AI engine independently and in combination.
 * 
 * No scheduling, no posting, no automation pressure.
 */
export default function Lab() {
  // Cross-panel state for easy asset passing
  const [voiceoverText, setVoiceoverText] = useState("");
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>();
  const [generatedVideoUrls, setGeneratedVideoUrls] = useState<string[]>([]);

  // Handle script generation
  const handleScriptGenerated = (script: string, voiceover: string) => {
    setVoiceoverText(voiceover);
  };

  // Handle voice generation
  const handleAudioGenerated = (url: string) => {
    setGeneratedAudioUrl(url);
  };

  // Handle video generation
  const handleVideoGenerated = (url: string, engine: VideoEngine) => {
    setGeneratedVideoUrls(prev => [...prev, url]);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/studio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Video Lab</h1>
          </div>
          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
            R&D Sandbox
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Chaos allowed • No automation</span>
        </div>
      </header>

      {/* Main Content - 4 Panel Layout */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="vertical">
          {/* Top Row: Script + Voice */}
          <ResizablePanel defaultSize={40} minSize={20}>
            <ResizablePanelGroup direction="horizontal">
              {/* Script Panel */}
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full overflow-auto border-r">
                  <ScriptPanel
                    onScriptGenerated={handleScriptGenerated}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Voice Panel */}
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full overflow-auto">
                  <VoicePanel
                    initialText={voiceoverText}
                    onAudioGenerated={handleAudioGenerated}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom Row: Visual + Assembly */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <ResizablePanelGroup direction="horizontal">
              {/* Visual Panel */}
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full overflow-auto border-r">
                  <VisualPanel
                    onVideoGenerated={handleVideoGenerated}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Assembly Panel */}
              <ResizablePanel defaultSize={35} minSize={25}>
                <div className="h-full overflow-auto">
                  <AssemblyPanel
                    audioUrl={generatedAudioUrl}
                    videoUrls={generatedVideoUrls}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
