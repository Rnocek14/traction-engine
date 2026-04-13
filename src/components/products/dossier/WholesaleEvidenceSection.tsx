import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Warehouse, ExternalLink, Star, ThumbsUp, ThumbsDown, ShieldCheck, ShieldQuestion, ShieldAlert, Eye } from "lucide-react";
import { type ProductWithAnalysis, type ProductLink } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function statusColor(status: string | null) {
  if (status === "verified") return "text-green-500 border-green-500/30";
  if (status === "probable") return "text-yellow-500 border-yellow-500/30";
  if (status === "candidate") return "text-orange-500 border-orange-500/30";
  return "text-destructive border-destructive/30";
}

export function WholesaleEvidenceSection({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const links = product.product_links || [];
  const suppliers = product.product_suppliers || [];
  const wholesaleLinks = links.filter(l => l.link_type === "wholesale" && l.validation_status !== "rejected");

  const handleOverride = async (linkId: string, newStatus: string) => {
    const { error } = await supabase
      .from("product_links")
      .update({
        validation_status: newStatus,
        verified: newStatus === "verified",
        manually_overridden: true,
        override_action: newStatus === "verified" ? "approve" : "reject",
      })
      .eq("id", linkId);
    if (error) { toast.error("Override failed"); return; }
    toast.success(`Link ${newStatus === "rejected" ? "rejected" : "approved"}`);
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  };

  // Find preferred supplier
  const preferred = suppliers.find(s => s.is_preferred);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Warehouse className="w-5 h-5" /> Wholesale / Supplier Evidence
            <Badge variant="outline" className="text-xs ml-1">{wholesaleLinks.length} links</Badge>
            <Badge variant="outline" className="text-xs">{suppliers.length} suppliers</Badge>
          </CardTitle>
          {preferred && (
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
              <span className="text-muted-foreground">Preferred:</span>
              <span className="font-medium">{preferred.supplier_name}</span>
              {preferred.unit_cost_cents && (
                <span className="text-muted-foreground">${(preferred.unit_cost_cents / 100).toFixed(2)}/unit</span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {suppliers.length === 0 && wholesaleLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No supplier data yet. Run AI Research to discover wholesale sources.</p>
        ) : (
          <div className="space-y-4">
            {/* Suppliers table */}
            {suppliers.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-[90px]">Platform</TableHead>
                      <TableHead className="w-[80px]">Unit Cost</TableHead>
                      <TableHead className="w-[80px]">Shipping</TableHead>
                      <TableHead className="w-[70px]">MOQ</TableHead>
                      <TableHead className="w-[90px]">Delivery</TableHead>
                      <TableHead className="w-[70px]">Score</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers
                      .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0) || (b.overall_supplier_score ?? 0) - (a.overall_supplier_score ?? 0))
                      .map(s => (
                        <TableRow key={s.id} className={s.is_preferred ? "bg-primary/5" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {s.is_preferred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                              <span className="font-medium text-sm">{s.supplier_name}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{s.platform}</Badge></TableCell>
                          <TableCell>{s.unit_cost_cents ? <span className="font-medium">${(s.unit_cost_cents / 100).toFixed(2)}</span> : "—"}</TableCell>
                          <TableCell>{s.shipping_cost_cents != null ? `$${(s.shipping_cost_cents / 100).toFixed(2)}` : "—"}</TableCell>
                          <TableCell>{s.moq && s.moq > 1 ? s.moq : "1"}</TableCell>
                          <TableCell>
                            {s.processing_days || s.delivery_days ? (
                              <span>{s.processing_days ? `${s.processing_days}+` : ""}{s.delivery_days ?? "?"}d</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {s.overall_supplier_score != null ? (
                              <span className={`font-medium ${s.overall_supplier_score >= 70 ? "text-green-500" : s.overall_supplier_score >= 50 ? "text-yellow-500" : "text-destructive"}`}>
                                {s.overall_supplier_score}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${
                              s.verification_status === "verified" ? "text-green-500 border-green-500/30" :
                              s.verification_status === "partially_verified" ? "text-yellow-500 border-yellow-500/30" :
                              "text-muted-foreground"
                            }`}>{s.verification_status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Wholesale links */}
            {wholesaleLinks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Wholesale Links</p>
                <div className="space-y-1">
                  {wholesaleLinks.map(link => (
                    <div key={link.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-[10px] shrink-0">{link.platform}</Badge>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColor(link.validation_status)}`}>
                          {link.match_confidence ?? 0}%
                        </Badge>
                        <span className="truncate">{link.extracted_product_name || link.title || link.url.slice(0, 40)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {link.price_cents && <span className="font-medium">${(link.price_cents / 100).toFixed(2)}</span>}
                        {link.validation_status !== "verified" && (
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-green-500/20"
                            onClick={() => handleOverride(link.id, "verified")}>
                            <ThumbsUp className="w-3 h-3 text-green-500" />
                          </Button>
                        )}
                        {link.validation_status !== "rejected" && (
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-destructive/20"
                            onClick={() => handleOverride(link.id, "rejected")}>
                            <ThumbsDown className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
