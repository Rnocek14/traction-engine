import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertAppAngle, useDeleteAppAngle, type AppAngle } from "@/hooks/use-app-angles";
import { Trash2 } from "lucide-react";

const EMOTIONS = ["fear", "curiosity", "value", "relatable", "social_proof", "aspiration"];
const CTA_STYLES = ["soft", "direct", "urgent", "none"];
const STATUSES = ["testing", "winner", "loser", "paused"];

interface Props {
  appId: string;
  angle?: AppAngle;
  trigger: React.ReactNode;
}

export function AngleEditDialog({ appId, angle, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertAppAngle();
  const del = useDeleteAppAngle();
  const [form, setForm] = useState({
    name: "",
    emotion: "curiosity",
    hypothesis: "",
    cta_style: "soft",
    target_audience: "",
    status: "testing",
    hooks: "",
  });

  useEffect(() => {
    if (angle) {
      setForm({
        name: angle.name,
        emotion: angle.emotion,
        hypothesis: angle.hypothesis ?? "",
        cta_style: angle.cta_style,
        target_audience: angle.target_audience ?? "",
        status: angle.status,
        hooks: angle.hook_examples.join("\n"),
      });
    }
  }, [angle, open]);

  const save = async () => {
    await upsert.mutateAsync({
      id: angle?.id,
      app_id: appId,
      name: form.name,
      emotion: form.emotion,
      hypothesis: form.hypothesis || null,
      cta_style: form.cta_style,
      target_audience: form.target_audience || null,
      status: form.status,
      hook_examples: form.hooks.split("\n").map(h => h.trim()).filter(Boolean),
    } as never);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{angle ? "Edit angle" : "New angle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Privacy Fear" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Emotion</Label>
              <Select value={form.emotion} onValueChange={v => setForm({ ...form, emotion: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CTA style</Label>
              <Select value={form.cta_style} onValueChange={v => setForm({ ...form, cta_style: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CTA_STYLES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Hypothesis</Label>
            <Textarea
              rows={2}
              value={form.hypothesis}
              onChange={e => setForm({ ...form, hypothesis: e.target.value })}
              placeholder="Why this angle should convert"
            />
          </div>
          <div>
            <Label>Target audience</Label>
            <Input value={form.target_audience} onChange={e => setForm({ ...form, target_audience: e.target.value })} />
          </div>
          <div>
            <Label>Hook examples (one per line)</Label>
            <Textarea
              rows={4}
              value={form.hooks}
              onChange={e => setForm({ ...form, hooks: e.target.value })}
              placeholder="Your email is on 45 broker sites&#10;Anyone can find your home address in 12 seconds"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {angle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await del.mutateAsync(angle.id);
                  setOpen(false);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || upsert.isPending}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
