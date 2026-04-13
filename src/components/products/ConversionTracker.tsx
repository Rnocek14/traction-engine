import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, BarChart3, TrendingUp, DollarSign, ShoppingCart, Loader2, Plus } from "lucide-react";
import { useProductConversionSummary, useProductConversions, useIngestConversion } from "@/hooks/use-conversions";

interface Props {
  productId: string;
  productName: string;
}

export function ConversionTracker({ productId, productName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { data: summary } = useProductConversionSummary(productId);
  const { data: history } = useProductConversions(productId);
  const ingest = useIngestConversion();

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    source: "manual",
    impressions: "",
    clicks: "",
    add_to_carts: "",
    purchases: "",
    revenue: "",
    ad_spend: "",
    refunds: "",
  });

  const handleSubmit = () => {
    ingest.mutate({
      product_id: productId,
      date: form.date,
      source: form.source,
      impressions: parseInt(form.impressions) || 0,
      clicks: parseInt(form.clicks) || 0,
      add_to_carts: parseInt(form.add_to_carts) || 0,
      purchases: parseInt(form.purchases) || 0,
      revenue_cents: Math.round((parseFloat(form.revenue) || 0) * 100),
      ad_spend_cents: Math.round((parseFloat(form.ad_spend) || 0) * 100),
      refunds: parseInt(form.refunds) || 0,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm(f => ({ ...f, impressions: "", clicks: "", add_to_carts: "", purchases: "", revenue: "", ad_spend: "", refunds: "" }));
      },
    });
  };

  const hasSummary = summary && summary.days > 0;

  return (
    <div className="border-t pt-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between text-xs h-7"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          Conversions
          {hasSummary && (
            <>
              <Badge variant="outline" className="text-[10px] ml-1">
                {summary.purchases} sales
              </Badge>
              {summary.is_winner && (
                <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">🏆 Winner</Badge>
              )}
            </>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>

      {expanded && (
        <div className="space-y-2 mt-1">
          {/* Summary stats */}
          {hasSummary && (
            <div className="grid grid-cols-2 gap-1.5 text-xs bg-muted/30 rounded p-2">
              <div className="flex items-center gap-1">
                <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Purchases:</span>
                <span className="font-medium">{summary.purchases}</span>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Revenue:</span>
                <span className="font-medium">${(summary.revenue_cents / 100).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">ROAS:</span>
                <span className={`font-medium ${summary.roas && summary.roas >= 3 ? "text-green-500" : summary.roas && summary.roas >= 1.5 ? "text-yellow-500" : "text-destructive"}`}>
                  {summary.roas ? `${summary.roas}x` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Net Profit:</span>
                <span className={`font-medium ${summary.net_profit_cents > 0 ? "text-green-500" : "text-destructive"}`}>
                  ${(summary.net_profit_cents / 100).toFixed(2)}
                </span>
              </div>
              {summary.conversion_rate != null && (
                <div className="flex items-center gap-1 col-span-2">
                  <span className="text-muted-foreground">CVR:</span>
                  <span className="font-medium">{(summary.conversion_rate * 100).toFixed(2)}%</span>
                  <span className="text-muted-foreground ml-2">Refunds:</span>
                  <span className="font-medium">{summary.refunds}</span>
                  <span className="text-muted-foreground ml-2">Days tracked:</span>
                  <span className="font-medium">{summary.days}</span>
                </div>
              )}
            </div>
          )}

          {/* History */}
          {history && history.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {history.slice(0, 7).map(h => (
                <div key={h.id} className="flex items-center justify-between text-[11px] bg-muted/20 rounded px-2 py-0.5">
                  <span className="text-muted-foreground">{h.date}</span>
                  <div className="flex items-center gap-2">
                    <span>{h.purchases} sales</span>
                    <span className="font-medium">${(h.revenue_cents / 100).toFixed(2)}</span>
                    {h.roas && <span className={h.roas >= 2 ? "text-green-500" : "text-muted-foreground"}>{h.roas}x</span>}
                    <Badge variant="outline" className="text-[9px]">{h.source}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add conversion form */}
          {showForm ? (
            <div className="space-y-2 bg-muted/20 rounded p-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Source</Label>
                  <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="tiktok_shop">TikTok Shop</SelectItem>
                      <SelectItem value="shopify">Shopify</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Impressions</Label>
                  <Input type="number" placeholder="0" value={form.impressions} onChange={e => setForm(f => ({ ...f, impressions: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Clicks</Label>
                  <Input type="number" placeholder="0" value={form.clicks} onChange={e => setForm(f => ({ ...f, clicks: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Add to Carts</Label>
                  <Input type="number" placeholder="0" value={form.add_to_carts} onChange={e => setForm(f => ({ ...f, add_to_carts: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Purchases</Label>
                  <Input type="number" placeholder="0" value={form.purchases} onChange={e => setForm(f => ({ ...f, purchases: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Revenue ($)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Ad Spend ($)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={form.ad_spend} onChange={e => setForm(f => ({ ...f, ad_spend: e.target.value }))} className="h-7 text-xs" />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="text-xs h-6 flex-1" onClick={handleSubmit} disabled={ingest.isPending}>
                  {ingest.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save Conversion Data
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs h-6" onClick={() => setShowForm(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add Conversion Data
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
