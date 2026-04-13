import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, ExternalLink, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, ShieldCheck, ShieldQuestion, ShieldAlert, Eye, AlertTriangle } from "lucide-react";
import { type ProductWithAnalysis, type ProductLink } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function getWarningFlags(link: ProductLink): string[] {
  const flags: string[] = [];
  if (!link.extracted_product_name) flags.push("no extracted title");
  if (!link.price_cents && !link.structured_price_cents) flags.push("no price found");
  if ((link.match_confidence ?? 0) < 50) flags.push("low confidence");
  if (link.fetch_method === "firecrawl") flags.push("JS-heavy page");
  if ((link.content_quality_score ?? 100) < 30) flags.push("thin content");
  return flags;
}

function ConfidenceIcon({ status }: { status: string | null }) {
  if (status === "verified") return <ShieldCheck className="w-3.5 h-3.5 text-green-500" />;
  if (status === "probable") return <ShieldQuestion className="w-3.5 h-3.5 text-yellow-500" />;
  if (status === "candidate") return <Eye className="w-3.5 h-3.5 text-orange-500" />;
  return <ShieldAlert className="w-3.5 h-3.5 text-destructive" />;
}

function statusColor(status: string | null) {
  if (status === "verified") return "text-green-500 border-green-500/30";
  if (status === "probable") return "text-yellow-500 border-yellow-500/30";
  if (status === "candidate") return "text-orange-500 border-orange-500/30";
  return "text-destructive border-destructive/30";
}

export function RetailEvidenceSection({ product }: { product: ProductWithAnalysis }) {
  const [showRejected, setShowRejected] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const links = product.product_links || [];
  const retailLinks = links.filter(l => l.link_type === "retail" && l.validation_status !== "rejected");
  const rejectedRetail = links.filter(l => l.link_type === "retail" && l.validation_status === "rejected");

  // Compute price stats from verified/probable links
  const pricedLinks = retailLinks.filter(l => (l.price_cents || l.structured_price_cents) && (l.validation_status === "verified" || l.validation_status === "probable"));
  const prices = pricedLinks.map(l => (l.structured_price_cents || l.price_cents || 0));
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const lowest = sortedPrices[0];
  const highest = sortedPrices[sortedPrices.length - 1];
  const median = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length / 2)] : undefined;

  const handleOverride = async (linkId: string, newStatus: string) => {
    const { error } = await supabase
      .from("product_links")
      .update({
        validation_status: newStatus,
        verified: newStatus === "verified",
        manually_overridden: true,
        override_action: newStatus === "verified" ? "approve" : "reject",
        validation_reasons: supabase.rpc ? undefined : undefined, // keep existing
      })
      .eq("id", linkId);
    if (error) { toast.error("Override failed"); return; }
    toast.success(`Link ${newStatus === "rejected" ? "rejected" : "approved"}`);
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Retail Evidence
            <Badge variant="outline" className="text-xs ml-1">{retailLinks.length} listings</Badge>
          </CardTitle>
          {sortedPrices.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Low: <span className="text-foreground font-medium">${((lowest || 0) / 100).toFixed(2)}</span></span>
              {median !== undefined && <span className="text-muted-foreground">Median: <span className="text-foreground font-medium">${(median / 100).toFixed(2)}</span></span>}
              <span className="text-muted-foreground">High: <span className="text-foreground font-medium">${((highest || 0) / 100).toFixed(2)}</span></span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {retailLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No retail listings found yet. Run AI Research to discover retail evidence.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Store</TableHead>
                  <TableHead>Product Title</TableHead>
                  <TableHead className="w-[80px]">Price</TableHead>
                  <TableHead className="w-[100px]">Confidence</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retailLinks.map(link => {
                  const warnings = getWarningFlags(link);
                  const expanded = expandedId === link.id;
                  return (
                    <>
                      <TableRow key={link.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expanded ? null : link.id)}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{link.platform}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm truncate max-w-[250px]">
                              {link.extracted_product_name || link.title || "—"}
                            </span>
                            {warnings.length > 0 && (
                              <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" title={warnings.join(", ")} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(link.structured_price_cents || link.price_cents) ? (
                            <span className="font-medium">${((link.structured_price_cents || link.price_cents || 0) / 100).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ConfidenceIcon status={link.validation_status} />
                            <span className="text-xs font-medium">{link.match_confidence ?? 0}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusColor(link.validation_status)}`}>
                            {link.validation_status || "pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {link.validation_status !== "verified" && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-green-500/20"
                                onClick={(e) => { e.stopPropagation(); handleOverride(link.id, "verified"); }}>
                                <ThumbsUp className="w-3 h-3 text-green-500" />
                              </Button>
                            )}
                            {link.validation_status !== "rejected" && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-destructive/20"
                                onClick={(e) => { e.stopPropagation(); handleOverride(link.id, "rejected"); }}>
                                <ThumbsDown className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                            <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow key={`${link.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/20">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs py-1">
                              {link.matched_tokens && link.matched_tokens.length > 0 && (
                                <div>
                                  <span className="text-muted-foreground">Matched tokens:</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {link.matched_tokens.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                                  </div>
                                </div>
                              )}
                              {link.distinctive_tokens_matched && link.distinctive_tokens_matched.length > 0 && (
                                <div>
                                  <span className="text-muted-foreground">Distinctive tokens:</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {link.distinctive_tokens_matched.map(t => <Badge key={t} className="text-[10px] bg-primary/10 text-primary">{t}</Badge>)}
                                  </div>
                                </div>
                              )}
                              {link.ai_verdict != null && (
                                <div>
                                  <span className="text-muted-foreground">AI verdict:</span>{" "}
                                  <span className={link.ai_verdict ? "text-green-500" : "text-destructive"}>
                                    {link.ai_verdict ? "Match" : "No match"} ({link.ai_confidence ?? 0}%)
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">Fetch method:</span>{" "}
                                <span>{link.fetch_method || "native"}</span>
                              </div>
                              {link.content_quality_score != null && (
                                <div>
                                  <span className="text-muted-foreground">Content quality:</span>{" "}
                                  <span>{link.content_quality_score}/100</span>
                                </div>
                              )}
                              {warnings.length > 0 && (
                                <div>
                                  <span className="text-muted-foreground">Warnings:</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {warnings.map(w => (
                                      <Badge key={w} variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">{w}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {link.validation_reasons && link.validation_reasons.length > 0 && (
                                <div className="col-span-full">
                                  <span className="text-muted-foreground">Validation reasons:</span>{" "}
                                  <span className="text-xs">{link.validation_reasons.join(" · ")}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Rejected links */}
        {rejectedRetail.length > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs"
              onClick={() => setShowRejected(!showRejected)}>
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldAlert className="w-3.5 h-3.5" /> {rejectedRetail.length} rejected
              </span>
              {showRejected ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            {showRejected && (
              <div className="space-y-1 mt-1">
                {rejectedRetail.map(link => (
                  <div key={link.id} className="flex items-center justify-between text-xs bg-destructive/5 rounded px-3 py-1.5 opacity-60">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{link.platform}</Badge>
                      <span className="truncate max-w-[300px]">{link.extracted_product_name || link.title || link.url.slice(0, 50)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-destructive">{link.match_confidence ?? 0}%</span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-green-500/20"
                        onClick={() => handleOverride(link.id, "verified")}>
                        <ThumbsUp className="w-3 h-3 text-green-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
