import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Warehouse, ExternalLink, Check, Loader2 } from "lucide-react";
import { type ProductWithAnalysis, type ProductLink } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function WholesaleEvidenceSection({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const links = product.product_links || [];
  const wholesaleLinks = links.filter(l => l.link_type === "wholesale");
  const confirmedLinks = wholesaleLinks.filter(l => l.validation_status === "verified");
  const pendingLinks = wholesaleLinks.filter(l => l.validation_status === "pending");
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmSelected = async () => {
    if (selected.size === 0) return;
    setConfirming(true);
    try {
      const { error } = await supabase
        .from("product_links")
        .update({
          validation_status: "verified",
          verified: true,
          manually_overridden: true,
          override_action: "approve",
          match_confidence: 100,
        })
        .in("id", [...selected]);
      if (error) throw error;

      // Reject the rest
      const rejectIds = pendingLinks.filter(l => !selected.has(l.id)).map(l => l.id);
      if (rejectIds.length > 0) {
        await supabase
          .from("product_links")
          .update({ validation_status: "rejected", verified: false })
          .in("id", rejectIds);
      }

      // Update product with best supplier price
      const confirmedPrices = pendingLinks
        .filter(l => selected.has(l.id) && l.price_cents)
        .map(l => l.price_cents!);
      if (confirmedPrices.length > 0) {
        const bestUrl = pendingLinks.find(l => selected.has(l.id))?.url;
        await supabase.from("products").update({
          supplier_price_cents: Math.min(...confirmedPrices),
          supplier_url: bestUrl || product.supplier_url,
          updated_at: new Date().toISOString(),
        }).eq("id", product.id);
      }

      // Trigger economics recalculation
      try {
        await supabase.functions.invoke("calculate-unit-economics", {
          body: { product_id: product.id },
        });
      } catch { /* optional */ }

      toast.success(`Confirmed ${selected.size} supplier link${selected.size > 1 ? "s" : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["product-detail"] });
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Warehouse className="w-5 h-5" /> Supplier Links
            {confirmedLinks.length > 0 && (
              <Badge className="text-xs bg-green-500/10 text-green-500 border-green-500/30">{confirmedLinks.length} confirmed</Badge>
            )}
            {pendingLinks.length > 0 && (
              <Badge variant="outline" className="text-xs">{pendingLinks.length} to review</Badge>
            )}
          </CardTitle>
          {selected.size > 0 && (
            <Button size="sm" onClick={confirmSelected} disabled={confirming}>
              {confirming ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              Confirm {selected.size} selected
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {wholesaleLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No supplier candidates yet. Run Research to find wholesale sources.</p>
        ) : (
          <div className="space-y-1.5">
            {confirmedLinks.map(link => (
              <LinkRow key={link.id} link={link} confirmed />
            ))}
            
            {pendingLinks.length > 0 && confirmedLinks.length > 0 && (
              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-1.5">Review candidates — select correct supplier links:</p>
              </div>
            )}
            {pendingLinks.map(link => (
              <LinkRow
                key={link.id}
                link={link}
                selectable
                isSelected={selected.has(link.id)}
                onToggle={() => toggle(link.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinkRow({ link, confirmed, selectable, isSelected, onToggle }: {
  link: ProductLink;
  confirmed?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const displayPrice = link.price_cents || link.structured_price_cents;
  
  return (
    <div className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
      confirmed ? "bg-green-500/5 border border-green-500/20" :
      isSelected ? "bg-primary/5 border border-primary/20" :
      "bg-muted/30 hover:bg-muted/50"
    }`}>
      {selectable && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          className="shrink-0"
        />
      )}
      {confirmed && <Check className="w-4 h-4 text-green-500 shrink-0" />}
      
      <Badge variant="outline" className="text-[10px] shrink-0">{link.platform}</Badge>
      
      <span className="truncate flex-1 min-w-0">
        {link.title || link.extracted_product_name || link.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 60)}
      </span>
      
      {displayPrice && (
        <span className="font-medium shrink-0">${(displayPrice / 100).toFixed(2)}</span>
      )}
      
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 hover:text-foreground text-muted-foreground"
        onClick={e => e.stopPropagation()}>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
