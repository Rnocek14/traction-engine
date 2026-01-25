/**
 * ContinuityAnchorsEditor
 * 
 * Editor for character/environment/camera continuity settings.
 * Used in the Story Builder to define the "show bible" for multi-clip stories.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  User, 
  MapPin, 
  Camera, 
  AlertTriangle,
  ChevronDown,
  Plus,
  X,
} from "lucide-react";
import type { ContinuityAnchors } from "@/lib/continuity-scoring";

interface ContinuityAnchorsEditorProps {
  anchors: ContinuityAnchors;
  onChange: (anchors: ContinuityAnchors) => void;
  discoveredArtifacts?: string[];
  className?: string;
}

const LENS_OPTIONS = ["24mm", "35mm", "50mm", "85mm", "135mm"];
const MOVEMENT_STYLES = ["static", "smooth", "handheld", "dolly", "crane", "drone"];
const TIME_OF_DAY_OPTIONS = ["dawn", "morning", "midday", "golden_hour", "dusk", "night"];

export function ContinuityAnchorsEditor({
  anchors,
  onChange,
  discoveredArtifacts = [],
  className,
}: ContinuityAnchorsEditorProps) {
  const [newToken, setNewToken] = useState("");
  const [newProp, setNewProp] = useState("");
  const [newNegative, setNewNegative] = useState("");

  const updateCharacter = (updates: Partial<NonNullable<ContinuityAnchors["character"]>>) => {
    onChange({
      ...anchors,
      character: { ...anchors.character, ...updates } as ContinuityAnchors["character"],
    });
  };

  const updateEnvironment = (updates: Partial<NonNullable<ContinuityAnchors["environment"]>>) => {
    onChange({
      ...anchors,
      environment: { ...anchors.environment, ...updates } as ContinuityAnchors["environment"],
    });
  };

  const updateCamera = (updates: Partial<NonNullable<ContinuityAnchors["camera_language"]>>) => {
    onChange({
      ...anchors,
      camera_language: { ...anchors.camera_language, ...updates } as ContinuityAnchors["camera_language"],
    });
  };

  const addToken = () => {
    if (!newToken.trim()) return;
    const tokens = anchors.character?.identity_lock_tokens || [];
    updateCharacter({ identity_lock_tokens: [...tokens, newToken.trim()] });
    setNewToken("");
  };

  const removeToken = (index: number) => {
    const tokens = anchors.character?.identity_lock_tokens || [];
    updateCharacter({ identity_lock_tokens: tokens.filter((_, i) => i !== index) });
  };

  const addProp = () => {
    if (!newProp.trim()) return;
    const props = anchors.environment?.props || [];
    updateEnvironment({ props: [...props, newProp.trim()] });
    setNewProp("");
  };

  const removeProp = (index: number) => {
    const props = anchors.environment?.props || [];
    updateEnvironment({ props: props.filter((_, i) => i !== index) });
  };

  const addNegative = (value?: string) => {
    const toAdd = value || newNegative.trim();
    if (!toAdd) return;
    const negatives = anchors.negative_list || [];
    if (!negatives.includes(toAdd)) {
      onChange({ ...anchors, negative_list: [...negatives, toAdd] });
    }
    setNewNegative("");
  };

  const removeNegative = (index: number) => {
    const negatives = anchors.negative_list || [];
    onChange({ ...anchors, negative_list: negatives.filter((_, i) => i !== index) });
  };

  return (
    <div className={className}>
      {/* Character Section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-primary transition-colors">
          <User className="h-4 w-4 text-blue-500" />
          Character Bible
          <ChevronDown className="h-3 w-3 ml-auto" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pl-6 pb-3">
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={anchors.character?.description || ""}
              onChange={(e) => updateCharacter({ description: e.target.value })}
              placeholder="Young woman, 28, dark hair in loose ponytail, warm smile..."
              className="h-16 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Wardrobe</Label>
            <Input
              value={anchors.character?.wardrobe || ""}
              onChange={(e) => updateCharacter({ wardrobe: e.target.value })}
              placeholder="Navy cable-knit sweater, silver necklace..."
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Identity Lock Tokens</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(anchors.character?.identity_lock_tokens || []).map((token, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                  {token}
                  <X 
                    className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" 
                    onClick={() => removeToken(i)} 
                  />
                </Badge>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              <Input
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="Add token..."
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToken())}
              />
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addToken}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Environment Section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-primary transition-colors">
          <MapPin className="h-4 w-4 text-green-500" />
          Environment Bible
          <ChevronDown className="h-3 w-3 ml-auto" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pl-6 pb-3">
          <div>
            <Label className="text-xs text-muted-foreground">Location</Label>
            <Input
              value={anchors.environment?.location || ""}
              onChange={(e) => updateEnvironment({ location: e.target.value })}
              placeholder="Modern home office, warm wood desk..."
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Time of Day</Label>
            <Select
              value={anchors.environment?.time_of_day || ""}
              onValueChange={(v) => updateEnvironment({ time_of_day: v })}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder="Select time..." />
              </SelectTrigger>
              <SelectContent>
                {TIME_OF_DAY_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Props</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(anchors.environment?.props || []).map((prop, i) => (
                <Badge key={i} variant="outline" className="text-[10px] gap-1">
                  {prop}
                  <X 
                    className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" 
                    onClick={() => removeProp(i)} 
                  />
                </Badge>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              <Input
                value={newProp}
                onChange={(e) => setNewProp(e.target.value)}
                placeholder="Add prop..."
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProp())}
              />
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addProp}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Camera Section */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-primary transition-colors">
          <Camera className="h-4 w-4 text-purple-500" />
          Camera Language
          <ChevronDown className="h-3 w-3 ml-auto" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pl-6 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Lens</Label>
              <Select
                value={anchors.camera_language?.lens || ""}
                onValueChange={(v) => updateCamera({ lens: v })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Lens..." />
                </SelectTrigger>
                <SelectContent>
                  {LENS_OPTIONS.map((l) => (
                    <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Movement</Label>
              <Select
                value={anchors.camera_language?.movement_style || ""}
                onValueChange={(v) => updateCamera({ movement_style: v })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Style..." />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_STYLES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Framing Rules</Label>
            <Input
              value={anchors.camera_language?.framing_rules || ""}
              onChange={(e) => updateCamera({ framing_rules: e.target.value })}
              placeholder="Always 16:9, subject in right third..."
              className="h-8 text-xs mt-1"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Negative List Section */}
      <Collapsible defaultOpen={discoveredArtifacts.length > 0 || (anchors.negative_list?.length || 0) > 0}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-primary transition-colors">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Negative List
          {(anchors.negative_list?.length || 0) > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {anchors.negative_list?.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-auto" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pl-6 pb-3">
          <div className="flex flex-wrap gap-1">
            {(anchors.negative_list || []).map((neg, i) => (
              <Badge key={i} variant="destructive" className="text-[10px] gap-1">
                {neg}
                <X 
                  className="h-2.5 w-2.5 cursor-pointer" 
                  onClick={() => removeNegative(i)} 
                />
              </Badge>
            ))}
          </div>
          
          {discoveredArtifacts.length > 0 && (
            <div>
              <Label className="text-[10px] text-muted-foreground">From Discovery</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {discoveredArtifacts
                  .filter(a => !anchors.negative_list?.includes(a))
                  .map((artifact) => (
                    <Badge 
                      key={artifact} 
                      variant="outline" 
                      className="text-[10px] cursor-pointer hover:bg-destructive/10"
                      onClick={() => addNegative(artifact)}
                    >
                      + {artifact}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-1">
            <Input
              value={newNegative}
              onChange={(e) => setNewNegative(e.target.value)}
              placeholder="Add negative..."
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNegative())}
            />
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => addNegative()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
