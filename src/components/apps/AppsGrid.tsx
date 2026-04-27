import { useState } from "react";
import { useApps, type App } from "@/hooks/use-apps";
import { AppCard } from "./AppCard";
import { AppEditDialog } from "./AppEditDialog";
import { Loader2 } from "lucide-react";

interface AppsGridProps {
  vertical?: string;
}

export function AppsGrid({ vertical }: AppsGridProps) {
  const { data, isLoading } = useApps(vertical);
  const [editing, setEditing] = useState<App | undefined>();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-12 border rounded-md">
        No apps yet. Add one to start marketing it.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            onEdit={(a) => {
              setEditing(a);
              setOpen(true);
            }}
          />
        ))}
      </div>
      {editing && (
        <AppEditDialog
          app={editing}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(undefined);
          }}
          trigger={<span />}
        />
      )}
    </>
  );
}
