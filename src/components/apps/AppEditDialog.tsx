import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type App, useUpsertApp } from "@/hooks/use-apps";

interface AppEditDialogProps {
  app?: App;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const KNOWN_VERTICALS = ["privacy", "health", "education", "gadgets", "home", "toys"];

export function AppEditDialog({ app, trigger, open, onOpenChange }: AppEditDialogProps) {
  const upsert = useUpsertApp();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState({
    name: "",
    cta_url: "",
    value_prop: "",
    target_audience: "",
    pricing_model: "free",
    description: "",
    verticals: [] as string[],
    hooks: "",
    readiness_score: 0,
  });

  useEffect(() => {
    if (app) {
      setForm({
        name: app.name,
        cta_url: app.cta_url ?? "",
        value_prop: app.value_prop ?? "",
        target_audience: app.target_audience ?? "",
        pricing_model: app.pricing_model ?? "free",
        description: app.description ?? "",
        verticals: app.verticals,
        hooks: app.hooks.join("\n"),
        readiness_score: app.readiness_score,
      });
    }
  }, [app]);

  const toggleVertical = (v: string) => {
    setForm((f) => ({
      ...f,
      verticals: f.verticals.includes(v) ? f.verticals.filter((x) => x !== v) : [...f.verticals, v],
    }));
  };

  const submit = async () => {
    await upsert.mutateAsync({
      ...(app?.id ? { id: app.id } : {}),
      name: form.name,
      cta_url: form.cta_url || null,
      url: form.cta_url || null,
      value_prop: form.value_prop || null,
      target_audience: form.target_audience || null,
      pricing_model: form.pricing_model || null,
      description: form.description || null,
      verticals: form.verticals,
      hooks: form.hooks.split("\n").map((h) => h.trim()).filter(Boolean),
      readiness_score: Number(form.readiness_score) || 0,
    });
    setOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{app ? "Edit app" : "Add app"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid gap-2">
            <Label>CTA URL</Label>
            <Input
              placeholder="https://..."
              value={form.cta_url}
              onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Value proposition</Label>
            <Textarea
              rows={2}
              placeholder="What does this app do for the user, in one sentence?"
              value={form.value_prop}
              onChange={(e) => setForm({ ...form, value_prop: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Target audience</Label>
            <Input
              placeholder="e.g. Privacy-conscious adults 25-55"
              value={form.target_audience}
              onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Pricing</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.pricing_model}
                onChange={(e) => setForm({ ...form, pricing_model: e.target.value })}
              >
                <option value="free">Free</option>
                <option value="freemium">Freemium</option>
                <option value="subscription">Subscription</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Readiness score (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.readiness_score}
                onChange={(e) => setForm({ ...form, readiness_score: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Verticals</Label>
            <div className="flex flex-wrap gap-2">
              {KNOWN_VERTICALS.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={form.verticals.includes(v) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVertical(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Hooks (one per line)</Label>
            <Textarea
              rows={4}
              placeholder="Your email is on 47 broker sites..."
              value={form.hooks}
              onChange={(e) => setForm({ ...form, hooks: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Description (internal)</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name || upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
