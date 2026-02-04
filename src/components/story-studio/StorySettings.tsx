/**
 * StorySettings - Story-level configuration panel
 */

import { useState } from "react";
import { X, Wand2, Film, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import type { Storyboard, StoryType } from "@/lib/continuity-scoring";

type StoryJob = Tables<"story_jobs">;

interface StorySettingsProps {
  story: StoryJob;
  storyboard: (Storyboard & {
    tier?: "volume" | "hero";
    character_continuity_mode?: boolean;
    locked_provider?: "sora" | "runway" | "luma";
    soft_continuity?: boolean;
    brutality_mode?: boolean;
    sanitization_level?: "soft" | "strict";
  }) | null;
  onClose: () => void;
}

export function StorySettings({ story, storyboard, onClose }: StorySettingsProps) {
  // Read-only display of current settings
  const tier = storyboard?.tier || "volume";
  const characterContinuityMode = storyboard?.character_continuity_mode || false;
  const lockedProvider = storyboard?.locked_provider || "sora";
  const softContinuity = storyboard?.soft_continuity ?? true;
  const brutalityMode = storyboard?.brutality_mode || false;
  const sanitizationLevel = storyboard?.sanitization_level || "soft";

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Story Settings</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Story Type */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Story Type</Label>
          <Badge variant="secondary" className="text-xs">
            {story.story_type}
          </Badge>
        </div>

        {/* Tier */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Quality Tier</Label>
          <div className="flex gap-2">
            <Badge 
              variant={tier === "hero" ? "default" : "outline"} 
              className="text-xs"
            >
              ⭐ Hero
            </Badge>
            <Badge 
              variant={tier === "volume" ? "default" : "outline"} 
              className="text-xs"
            >
              📦 Volume
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Hero tier uses more Sora scenes for higher quality
          </p>
        </div>

        <Separator />

        {/* Continuity Mode */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Film className="h-3 w-3" />
              Character Continuity
            </Label>
            <Badge variant={characterContinuityMode ? "default" : "outline"} className="text-[10px]">
              {characterContinuityMode ? "On" : "Off"}
            </Badge>
          </div>
          
          {characterContinuityMode && (
            <div className="pl-4 border-l-2 border-primary/30 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                All scenes use {lockedProvider.toUpperCase()} for consistent characters
              </p>
              {softContinuity && (
                <Badge variant="outline" className="text-[10px]">
                  Soft mode: Energy roles may use T2V
                </Badge>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Moderation */}
        <div className="space-y-3">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Content Settings
          </Label>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs">Brutality Mode</span>
              <Badge variant={brutalityMode ? "destructive" : "outline"} className="text-[10px]">
                {brutalityMode ? "On" : "Off"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs">Sanitization</span>
              <Badge variant="outline" className="text-[10px]">
                {sanitizationLevel}
              </Badge>
            </div>
          </div>
          
          {brutalityMode && (
            <p className="text-[10px] text-amber-600">
              ⚠️ Reduced sanitization may increase moderation failures
            </p>
          )}
        </div>

        <Separator />

        {/* Scene Count */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Scenes</Label>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {storyboard?.scenes?.length || 0} total
            </Badge>
            <Badge variant="outline" className="text-xs">
              ~{Math.round((storyboard?.scenes || []).reduce(
                (sum, s) => sum + (s.duration_target || 5), 0
              ))}s duration
            </Badge>
          </div>
        </div>

        <Separator />

        <p className="text-[10px] text-muted-foreground">
          Settings are read-only here. To modify, use the generation panel.
        </p>
      </div>
    </ScrollArea>
  );
}
