import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Lightbulb, Star, ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { TodaysPlan } from "@/hooks/use-vertical-engine";

interface Props {
  plan: TodaysPlan;
}

export function SuggestionsCard({ plan }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Recommended Products */}
      {plan.suggestedProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              Recommended Products
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.suggestedProducts.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/products/${p.id}`)}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.price_cents && (
                      <span className="text-[10px] text-muted-foreground">${(p.price_cents / 100).toFixed(0)}</span>
                    )}
                    {p.estimated_margin_pct && (
                      <Badge variant="outline" className="text-[10px] h-4">{p.estimated_margin_pct}% margin</Badge>
                    )}
                    {p.has_images ? (
                      <ImageIcon className="w-3 h-3 text-primary" />
                    ) : (
                      <ImageIcon className="w-3 h-3 text-destructive" />
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">{p.score}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top Ideas */}
      {plan.topIdeas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Top Ideas to Produce
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {plan.topIdeas.map(i => (
              <div key={i.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{i.title}</p>
                  {i.angle && <p className="text-[10px] text-muted-foreground truncate">{i.angle}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {i.opportunity_score != null && (
                    <Badge variant="secondary" className="text-[10px] h-4">{i.opportunity_score}</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] h-4">{i.content_type}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
