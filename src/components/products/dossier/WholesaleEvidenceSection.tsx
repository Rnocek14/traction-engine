import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Warehouse, ExternalLink, Check, Loader2, Plus, Pin, Trash2 } from "lucide-react";
import { type ProductWithAnalysis, type ProductLink } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function detectPlatform(url: string): string {
  if (url.includes("aliexpress")) return "AliExpress";
  if (url.includes("alibaba")) return "Alibaba";
  if (url.includes("dhgate")) return "DHgate";
  if (url.includes("1688")) return "1688";
  if (url.includes("temu")) return "Temu";
  return "Other";
}

export function WholesaleEvidenceSection({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const links = product.product_links || [];
  const wholesaleLinks = links.filter(l => l.link_type === "wholesale");
  const confirmedLinks = wholesaleLinks.filter(l => l.validation_status === "verified");
  const pendingLinks = wholesaleLinks.filter(l => l.validation_status === "pending");
  const suppliers = product.product_suppliers || [];
  const preferredSupplier = suppliers.find(s => s.is_preferred);
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddManualUrl = async () => {
    const url = manualUrl.trim();
    if (!url) return;
    setAddingManual(true);
    try {
      const platform = detectPlatform(url);
      
      // Add as a verified product link
      const { error: linkErr } = await supabase.from("product_links").insert({
        product_id: product.id,
        url,
        link_type: "wholesale",
        platform,
        validation_status: "verified",
        verified: true,
        manually_overridden: true,
        override_action: "approve",
        match_confidence: 100,
      });
      if (linkErr) throw linkErr;

      // Create/update supplier record
      const { data: supplier, error: supErr } = await supabase.from("product_suppliers").upsert({
        product_id: product.id,
        supplier_name: platform + " listing",
        platform,
        supplier_url: url,
        verification_status: "manual",
        is_preferred: true,
      }, { onConflict: "product_id,supplier_name" }).select("id").single();

      // If we got a supplier id, set it as preferred on the product
      if (supplier && !supErr) {
        await supabase.from("products").update({
          preferred_supplier_id: supplier.id,
          supplier_url: url,
        }).eq("id", product.id);

        // Unset other suppliers as preferred
        await supabase.from("product_suppliers")
          .update({ is_preferred: false })
          .eq("product_id", product.id)
          .neq("id", supplier.id);
      }

      // Scrape images from pinned supplier listing
      try {
        await supabase.functions.invoke("scrape-supplier-images", {
          body: { product_id: product.id, supplier_url: url },
        });
      } catch { /* non-blocking */ }

      toast.success(`Supplier listing pinned from ${platform} — scraping images`);
      setManualUrl("");
      qc.invalidateQueries({ queryKey: ["product-detail"] });
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setAddingManual(false);
    }
  };

  const handlePinAsSupplier = async (link: ProductLink) => {
    try {
      const platform = link.platform || detectPlatform(link.url);

      // Create supplier record
      const { data: supplier, error } = await supabase.from("product_suppliers").upsert({
        product_id: product.id,
        supplier_name: (link.title || link.extracted_product_name || platform + " listing").slice(0, 100),
        platform,
        supplier_url: link.url,
        unit_cost_cents: link.price_cents || link.structured_price_cents || null,
        verification_status: "manual",
        is_preferred: true,
      }, { onConflict: "product_id,supplier_name" }).select("id").single();

      if (error) throw error;

      // Set as preferred on product
      await supabase.from("products").update({
        preferred_supplier_id: supplier.id,
        supplier_url: link.url,
        supplier_price_cents: link.price_cents || link.structured_price_cents || product.supplier_price_cents,
      }).eq("id", product.id);

      // Unset other suppliers
      await supabase.from("product_suppliers")
        .update({ is_preferred: false })
        .eq("product_id", product.id)
        .neq("id", supplier.id);

      // Mark link as verified
      await supabase.from("product_links").update({
        validation_status: "verified",
        verified: true,
        manually_overridden: true,
        override_action: "approve",
      }).eq("id", link.id);

      // Scrape images from pinned supplier listing
      try {
        await supabase.functions.invoke("scrape-supplier-images", {
          body: { product_id: product.id, supplier_url: link.url },
        });
      } catch { /* non-blocking */ }

      toast.success("Pinned as preferred supplier — scraping images");
      qc.invalidateQueries({ queryKey: ["product-detail"] });
    } catch (e: any) {
      toast.error(e.message);
    }
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
      <CardContent className="space-y-4">
        {/* Preferred supplier callout */}
        {preferredSupplier && (
          <div className="rounded-lg border-2 border-green-500/30 bg-green-500/5 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">Pinned Supplier</span>
              <Badge variant="outline" className="text-[10px]">{preferredSupplier.platform}</Badge>
            </div>
            <p className="text-sm truncate">
              {preferredSupplier.supplier_name}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {preferredSupplier.unit_cost_cents && (
                <span>Unit cost: ${(preferredSupplier.unit_cost_cents / 100).toFixed(2)}</span>
              )}
              {preferredSupplier.supplier_url && (
                <a href={preferredSupplier.supplier_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground">
                  <ExternalLink className="w-3 h-3" /> View listing
                </a>
              )}
            </div>
          </div>
        )}

        {/* Manual URL paste */}
        <div className="flex gap-2">
          <Input
            placeholder="Paste exact supplier product URL (AliExpress, Alibaba, DHgate...)"
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddManualUrl()}
            className="text-sm"
          />
          <Button size="sm" onClick={handleAddManualUrl} disabled={addingManual || !manualUrl.trim()}>
            {addingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Pin
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Browse the search links below, find the exact product, then paste the listing URL here to lock it in.
        </p>

        {/* Existing links */}
        {wholesaleLinks.length === 0 && !preferredSupplier ? (
          <p className="text-sm text-muted-foreground text-center py-4">No supplier candidates yet. Run Research to find wholesale sources.</p>
        ) : (
          <div className="space-y-1.5">
            {confirmedLinks.map(link => (
              <LinkRow key={link.id} link={link} confirmed onPin={() => handlePinAsSupplier(link)} isPinned={preferredSupplier?.supplier_url === link.url} />
            ))}
            
            {pendingLinks.length > 0 && confirmedLinks.length > 0 && (
              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-1.5">Review candidates — click the pin to select as your supplier:</p>
              </div>
            )}
            {pendingLinks.length > 0 && confirmedLinks.length === 0 && (
              <p className="text-xs text-muted-foreground mb-1.5">These are search results — open them, find the exact product, then paste the URL above:</p>
            )}
            {pendingLinks.map(link => (
              <LinkRow
                key={link.id}
                link={link}
                selectable
                isSelected={selected.has(link.id)}
                onToggle={() => toggle(link.id)}
                onPin={() => handlePinAsSupplier(link)}
                isPinned={false}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinkRow({ link, confirmed, selectable, isSelected, onToggle, onPin, isPinned }: {
  link: ProductLink;
  confirmed?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const displayPrice = link.price_cents || link.structured_price_cents;
  
  return (
    <div className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
      isPinned ? "bg-green-500/5 border border-green-500/30 ring-1 ring-green-500/20" :
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
      {confirmed && !isPinned && <Check className="w-4 h-4 text-green-500 shrink-0" />}
      {isPinned && <Pin className="w-4 h-4 text-green-500 shrink-0" />}
      
      <Badge variant="outline" className="text-[10px] shrink-0">{link.platform}</Badge>
      
      <span className="truncate flex-1 min-w-0">
        {link.title || link.extracted_product_name || link.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 60)}
      </span>
      
      {displayPrice && (
        <span className="font-medium shrink-0">${(displayPrice / 100).toFixed(2)}</span>
      )}

      {onPin && !isPinned && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onPin} title="Pin as my supplier">
          <Pin className="w-3.5 h-3.5" />
        </Button>
      )}
      
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 hover:text-foreground text-muted-foreground"
        onClick={e => e.stopPropagation()}>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
