import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Sparkles, Users, MessageSquare } from "lucide-react";

interface AccountConfig {
  id: string;
  account_id: string;
  account_name: string | null;
  platform: string;
  monetization_mode: string;
  content_style: string | null;
  hook_style: string;
  content_pillars: string[];
  promise: string;
  persona: { tone?: string; vibe?: string } | null;
  audience: { who?: string; pain_points?: string[] } | null;
  cta_style: string;
  cta_phrases: string[];
  handle: string | null;
}

const HOOK_STYLES = ["curiosity", "shock", "problem", "aesthetic", "demo", "listicle"];

export function AccountIdentityCard({ account, vertical, storyCount }: { account: AccountConfig; vertical: string; storyCount: number }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm">{account.account_name || account.account_id}</p>
              {account.handle && <p className="text-xs text-muted-foreground">@{account.handle}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">{account.platform}</Badge>
              <Badge variant="secondary" className="text-[10px]">{account.monetization_mode}</Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic line-clamp-2">"{account.promise}"</p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              <span>{account.hook_style || "curiosity"}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              <span>{(account.persona as any)?.tone || "informative"}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" />
              <span>{(account.audience as any)?.who?.split(" ").slice(0, 2).join(" ") || "general"}</span>
            </div>
          </div>

          {account.content_pillars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {account.content_pillars.slice(0, 4).map(p => (
                <Badge key={p} variant="outline" className="text-[10px] font-normal">{p}</Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>{account.content_style || "No style set"}</span>
            <span>{storyCount} stories</span>
          </div>
        </CardContent>
      </Card>

      <AccountEditDialog
        open={editing}
        onOpenChange={setEditing}
        account={account}
        vertical={vertical}
      />
    </>
  );
}

function AccountEditDialog({ open, onOpenChange, account, vertical }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account: AccountConfig;
  vertical: string;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [contentStyle, setContentStyle] = useState(account.content_style || "");
  const [hookStyle, setHookStyle] = useState(account.hook_style || "curiosity");
  const [tone, setTone] = useState((account.persona as any)?.tone || "informative");
  const [vibe, setVibe] = useState((account.persona as any)?.vibe || "friendly");
  const [audienceWho, setAudienceWho] = useState((account.audience as any)?.who || "");
  const [pillars, setPillars] = useState(account.content_pillars.join(", "));
  const [promise, setPromise] = useState(account.promise);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("account_configs")
      .update({
        content_style: contentStyle || null,
        hook_style: hookStyle,
        persona: { tone, vibe },
        audience: { who: audienceWho, pain_points: (account.audience as any)?.pain_points || [] },
        content_pillars: pillars.split(",").map(s => s.trim()).filter(Boolean),
        promise,
      })
      .eq("id", account.id);

    setSaving(false);
    if (error) {
      toast.error("Failed to save", { description: error.message });
    } else {
      toast.success("Account identity updated");
      queryClient.invalidateQueries({ queryKey: ["vertical-detail", vertical] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {account.account_name || account.account_id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Brand Promise</Label>
            <Textarea value={promise} onChange={e => setPromise(e.target.value)} rows={2} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Content Style</Label>
              <Input value={contentStyle} onChange={e => setContentStyle(e.target.value)} placeholder="fast cuts, aesthetic, storytelling..." className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs font-medium">Hook Style</Label>
              <Select value={hookStyle} onValueChange={setHookStyle}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOOK_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Tone</Label>
              <Input value={tone} onChange={e => setTone(e.target.value)} placeholder="informative, witty, urgent..." className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs font-medium">Vibe</Label>
              <Input value={vibe} onChange={e => setVibe(e.target.value)} placeholder="friendly, edgy, luxe..." className="mt-1 h-8" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Target Audience</Label>
            <Input value={audienceWho} onChange={e => setAudienceWho(e.target.value)} placeholder="tech-savvy millennials, budget parents..." className="mt-1 h-8" />
          </div>

          <div>
            <Label className="text-xs font-medium">Content Pillars (comma-separated)</Label>
            <Input value={pillars} onChange={e => setPillars(e.target.value)} placeholder="gadgets, reviews, unboxings, comparisons" className="mt-1 h-8" />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Identity"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
