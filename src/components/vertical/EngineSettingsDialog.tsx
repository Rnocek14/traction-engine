import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { VerticalConfig } from "@/hooks/use-vertical-engine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: VerticalConfig | null;
  onSave: (updates: Partial<VerticalConfig>) => void;
}

export function EngineSettingsDialog({ open, onOpenChange, config, onSave }: Props) {
  const [growthTarget, setGrowthTarget] = useState(3);
  const [productTarget, setProductTarget] = useState(1);
  const [growthRatio, setGrowthRatio] = useState(80);
  const [autoGenerate, setAutoGenerate] = useState(false);

  useEffect(() => {
    if (config) {
      setGrowthTarget(config.daily_growth_target);
      setProductTarget(config.daily_product_target);
      setGrowthRatio(config.growth_ratio);
      setAutoGenerate(config.auto_generate);
    }
  }, [config]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Content Engine Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Daily targets */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Daily Targets</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Growth posts</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={growthTarget}
                  onChange={e => setGrowthTarget(parseInt(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Product posts</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={productTarget}
                  onChange={e => setProductTarget(parseInt(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Content mix ratio */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">Content Mix</Label>
              <span className="text-xs text-muted-foreground">{growthRatio}% growth / {100 - growthRatio}% monetization</span>
            </div>
            <Slider
              value={[growthRatio]}
              onValueChange={([v]) => setGrowthRatio(v)}
              min={20}
              max={100}
              step={5}
            />
          </div>

          {/* Auto-generation toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-Generation</Label>
              <p className="text-xs text-muted-foreground">Automatically create content daily</p>
            </div>
            <Switch checked={autoGenerate} onCheckedChange={setAutoGenerate} />
          </div>

          <Button
            className="w-full"
            onClick={() => {
              onSave({
                daily_growth_target: growthTarget,
                daily_product_target: productTarget,
                growth_ratio: growthRatio,
                auto_generate: autoGenerate,
              });
              onOpenChange(false);
            }}
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
