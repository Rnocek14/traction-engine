import { Badge } from "@/components/ui/badge";
import { Target, Megaphone, ShoppingCart, HelpCircle, FileText, Zap, Play } from "lucide-react";

interface MarketingPlan {
  marketing_plan?: {
    target_audience?: string;
    winning_angles?: Array<{ name: string; description: string; demo_concept?: string }>;
    cta_strategy?: string;
    cta_url_suggestion?: string;
    recommended_accounts?: string[];
    key_selling_points?: string[];
    objection_handling?: Array<{ objection: string; response: string }>;
  };
  content_ideas?: Array<{ title: string; hook: string; angle: string; emotional_trigger: string; suggested_format: string }>;
  page_draft?: {
    headline?: string;
    subheadline?: string;
    benefits?: string[];
    faq?: Array<{ question: string; answer: string }>;
    cta_copy?: string;
    product_description?: string;
    social_proof_suggestions?: string[];
    media_suggestions?: string[];
  };
}

export function ProductMarketingPlan({ plan }: { plan: MarketingPlan }) {
  const mp = plan.marketing_plan;
  const pd = plan.page_draft;

  return (
    <div className="space-y-3 text-xs border-t pt-3">
      {/* Target Audience */}
      {mp?.target_audience && (
        <div>
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <Target className="w-3 h-3" /> Audience
          </div>
          <p className="text-foreground">{mp.target_audience}</p>
        </div>
      )}

      {/* Winning Angles */}
      {mp?.winning_angles && mp.winning_angles.length > 0 && (
        <div>
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <Megaphone className="w-3 h-3" /> Angles
          </div>
          <div className="space-y-1">
            {mp.winning_angles.map((a, i) => (
              <div key={i} className="bg-muted/50 rounded px-2 py-1">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground ml-1">— {a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Hook & First 3 Seconds */}
      {(mp?.best_hook_type || mp?.best_first_3_seconds) && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 space-y-1">
          {mp.best_hook_type && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" />
              <span className="font-medium text-primary">Best Hook:</span>
              <span className="text-foreground">{mp.best_hook_type}</span>
            </div>
          )}
          {mp.best_first_3_seconds && (
            <div className="flex items-start gap-1">
              <Play className="w-3 h-3 text-primary mt-0.5" />
              <span className="font-medium text-primary">First 3s:</span>
              <span className="text-foreground italic">"{mp.best_first_3_seconds}"</span>
            </div>
          )}
        </div>
      )}

      {/* CTA Strategy */}
      {mp?.cta_strategy && (
        <div>
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <ShoppingCart className="w-3 h-3" /> CTA
          </div>
          <p className="text-foreground">{mp.cta_strategy}</p>
          {mp.cta_url_suggestion && (
            <Badge variant="outline" className="text-xs mt-1">{mp.cta_url_suggestion}</Badge>
          )}
        </div>
      )}

      {/* Key Selling Points */}
      {mp?.key_selling_points && mp.key_selling_points.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">Selling Points</div>
          <ul className="list-disc list-inside space-y-0.5 text-foreground">
            {mp.key_selling_points.map((pt, i) => <li key={i}>{pt}</li>)}
          </ul>
        </div>
      )}

      {/* Page Draft Preview */}
      {pd && (
        <div>
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <FileText className="w-3 h-3" /> Page Draft
          </div>
          <div className="bg-muted/50 rounded p-2 space-y-1">
            {pd.headline && <p className="font-bold text-sm text-foreground">{pd.headline}</p>}
            {pd.subheadline && <p className="text-muted-foreground">{pd.subheadline}</p>}
            {pd.benefits && pd.benefits.length > 0 && (
              <ul className="list-disc list-inside text-foreground">
                {pd.benefits.slice(0, 4).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            {pd.cta_copy && <p className="font-medium text-primary">{pd.cta_copy}</p>}
          </div>
        </div>
      )}

      {/* FAQ */}
      {pd?.faq && pd.faq.length > 0 && (
        <div>
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <HelpCircle className="w-3 h-3" /> FAQ
          </div>
          <div className="space-y-1">
            {pd.faq.map((f, i) => (
              <div key={i} className="bg-muted/50 rounded px-2 py-1">
                <p className="font-medium text-foreground">{f.question}</p>
                <p className="text-muted-foreground">{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
