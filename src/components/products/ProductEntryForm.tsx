import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useCreateProduct } from "@/hooks/use-products";

const CATEGORIES = ["Electronics", "Home & Garden", "Toys & Games", "Beauty", "Fashion", "Kitchen", "Pet Supplies", "Fitness", "Outdoor", "Other"];

export function ProductEntryForm() {
  const [open, setOpen] = useState(false);
  const createProduct = useCreateProduct();

  const [form, setForm] = useState({
    name: "",
    category: "",
    source_url: "",
    image_url: "",
    price_cents: "",
    supplier_price_cents: "",
    supplier_url: "",
    shipping_days: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProduct.mutate(
      {
        name: form.name,
        category: form.category || undefined,
        source_url: form.source_url || undefined,
        image_url: form.image_url || undefined,
        price_cents: form.price_cents ? Math.round(parseFloat(form.price_cents) * 100) : undefined,
        supplier_price_cents: form.supplier_price_cents ? Math.round(parseFloat(form.supplier_price_cents) * 100) : undefined,
        supplier_url: form.supplier_url || undefined,
        shipping_days: form.shipping_days ? parseInt(form.shipping_days) : undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", category: "", source_url: "", image_url: "", price_cents: "", supplier_price_cents: "", supplier_url: "", shipping_days: "", notes: "" });
        },
      }
    );
  };

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Product
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Product Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="LED Galaxy Projector" />
          </div>
          <div>
            <Label>Category</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Select...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sell Price ($)</Label>
              <Input type="number" step="0.01" value={form.price_cents} onChange={(e) => set("price_cents", e.target.value)} placeholder="29.99" />
            </div>
            <div>
              <Label>Supplier Cost ($)</Label>
              <Input type="number" step="0.01" value={form.supplier_price_cents} onChange={(e) => set("supplier_price_cents", e.target.value)} placeholder="8.50" />
            </div>
          </div>
          <div>
            <Label>Source URL (Amazon / TikTok Shop)</Label>
            <Input value={form.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Supplier URL (AliExpress)</Label>
            <Input value={form.supplier_url} onChange={(e) => set("supplier_url", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Image URL</Label>
            <Input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Shipping Days</Label>
            <Input type="number" value={form.shipping_days} onChange={(e) => set("shipping_days", e.target.value)} placeholder="7" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Why this product? Initial thoughts..." />
          </div>
          <Button type="submit" className="w-full" disabled={!form.name || createProduct.isPending}>
            {createProduct.isPending ? "Adding..." : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
