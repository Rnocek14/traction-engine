import { useParams, useNavigate, Link } from "react-router-dom";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { StudioLauncher } from "@/components/studio/StudioLauncher";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  useScriptRunDetail,
  useScriptVersionChain,
} from "@/hooks/use-studio";

export default function Studio() {
  const { scriptRunId } = useParams<{ scriptRunId: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(scriptRunId);
  const [userHasAccess, setUserHasAccess] = useState<boolean | null>(null);

  // Check role access
  useEffect(() => {
    let alive = true;

    if (!user) {
      setUserHasAccess(null);
      return;
    }

    hasRole(["admin", "qa"]).then((ok) => {
      if (alive) setUserHasAccess(ok);
    });

    return () => {
      alive = false;
    };
  }, [user, hasRole]);

  // Validate scriptRunId format and redirect if malformed
  useEffect(() => {
    if (scriptRunId && !scriptRunId.match(/^[0-9a-f-]{36}$/i)) {
      navigate("/studio", { replace: true });
    }
  }, [scriptRunId, navigate]);

  // Sync selectedVersionId with URL changes
  useEffect(() => {
    setSelectedVersionId(scriptRunId);
  }, [scriptRunId]);

  const activeScriptId = selectedVersionId || scriptRunId;

  const {
    data: scriptRun,
    isLoading: scriptLoading,
    error: scriptError,
  } = useScriptRunDetail(activeScriptId);

  const {
    data: versionChain,
    isLoading: chainLoading,
  } = useScriptVersionChain(scriptRunId);

  const handleVersionSelect = (scriptId: string) => {
    setSelectedVersionId(scriptId);
    navigate(`/studio/${scriptId}`, { replace: true });
  };

  // No script ID - show launcher
  if (!scriptRunId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudioHeader />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
                <Sparkles className="h-8 w-8 text-primary" />
                Rendition Studio
              </h1>
              <p className="text-muted-foreground">
                Generate scripts, iterate on content, and create videos
              </p>
            </div>
            <StudioLauncher />
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (scriptLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudioHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading script...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (scriptError || !scriptRun) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudioHeader />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full">
            <div className="text-center mb-8">
              <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Script Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The script "{scriptRunId.slice(0, 8)}..." could not be loaded.
              </p>
            </div>
            <StudioLauncher />
          </div>
        </div>
      </div>
    );
  }

  // Main DaVinci-style studio layout
  return (
    <div className="h-screen bg-[hsl(222_47%_4%)] flex flex-col overflow-hidden">
      <StudioHeader />
      <StudioLayout
        script={scriptRun}
        versionChain={versionChain || []}
        chainLoading={chainLoading}
        onVersionSelect={handleVersionSelect}
        currentScriptId={activeScriptId || ""}
      />
    </div>
  );
}

function StudioHeader() {
  return (
    <header className="h-14 flex-shrink-0 border-b border-border/30 bg-[hsl(222_47%_6%)]/80 backdrop-blur-xl">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-foreground hover:text-primary transition-colors">
            Content Engine
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/studio" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            Rendition Studio
          </Link>
        </div>
        <AuthHeader />
      </div>
    </header>
  );
}
