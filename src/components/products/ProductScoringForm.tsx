import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useSaveProductAnalysis, type ProductWithAnalysis } from "@/hooks/use-products";

const DIMENSIONS = [
  { key: "wow_factor", label: "Wow Factor", desc: "How visually surprising or impressive" },
  { key: "social_media_potential", label: "Social Media Potential", desc: "Shareability and virality" },
  { key: "impulse_buy_appeal", label: "Impulse Buy Appeal", desc: "Would someone buy without thinking?" },
  { key: "demonstrability_score", label: "Demonstrability", desc: "Can you show value in <10 seconds?" },
  { key: "competition_level", label: "Competition Level", desc: "1 = blue ocean, 5 = saturated" },
] as const;

const TRENDING_OPTIONS = ["emerging", "rising", "peak", "declining", "saturated"];
const EMOTION_OPTIONS = ["kids", "pets", "gift", "transformation", "before_after", "satisfying", "luxury", "budget", "problem_solver", "novelty"];

export function ProductScoringForm({ product }: { product: ProductWithAnalysis }) {
  const existing = product.product_analysis?.[0];
  const save = useSaveProductAnalysis();
  const [open, setOpen] = useState(false);

  const [scores, setScores] = useState({
    wow_factor: existing?.wow_factor ?? 3,
    social_media_potential: existing?.social_media_potential ?? 3,
    impulse_buy_appeal: existing?.impulse_buy_appeal ?? 3,
    demonstrability_score: existing?.demonstrability_score ?? 3,
    competition_level: existing?.competition_level ?? 3,
  });
  const [priceSweetSpot, setPriceSweetSpot] = useState(existing?.price_sweet_spot ?? false);
  const [trendingStatus, setTrendingStatus] = useState(existing?.trending_status ?? "emerging");
  const [triggers, setTriggers] = useState<string[]>(existing?.emotional_triggers ?? []);

  const toggleTrigger = (t: string) =>
    setTriggers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleSave = () => {
    save.mutate(
      {
        product_id: product.id,
        ...scores,
        price_sweet_spot: priceSweetSpot,
        emotional_triggers: triggers,
        trending_status: trendingStatus,
      },
      { onSuccess: () => setOpen(false) }
    );
  };

  const overall = Math.round(
    ((scores.wow_factor + scores.social_media_potential + scores.impulse_buy_appeal + scores.demonstrability_score + (6 - scores.competition_level)) / 25) * 100
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BarChart3 className="w-3 h-3 mr-1" /> Score
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Score: {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {DIMENSIONS.map(({ key, label, desc }) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                <Label className="text-sm">{label}</Label>
                <span className="text-sm font-mono text-muted-foreground">{scores[key]}/5</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{desc}</p>
              <Slider
                value={[scores[key]]}
                onValueChange={([v]) => setScores((s) => ({ ...s, [key]: v }))}
                min={1}
                max={5}
                step={1}
              />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <div>
              <Label>Price Sweet Spot ($25-49)</Label>
              <p className="text-xs text-muted-foreground">Optimal impulse buy range</p>
            </div>
            <Switch checked={priceSweetSpot} onCheckedChange={setPriceSweetSpot} />
          </div>

          <div>
            <Label>Trending Status</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm mt-1"
              value={trendingStatus}
              onChange={(e) => setTrendingStatus(e.target.value)}
            >
              {TRENDING_OPTIONS.map((o) => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Emotional Triggers</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EMOTION_OPTIONS.map((t) => (
                <Badge
                  key={t}
                  variant={triggers.includes(t) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleTrigger(t)}
                >
                  {t.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <span className="text-sm font-medium">Overall Score</span>
              <span className={`ml-2 text-lg font-bold ${overall >= 70 ? "text-green-500" : overall >= 40 ? "text-yellow-500" : "text-red-500"}`}>
                {overall}
              </span>
            </div>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save Analysis"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
