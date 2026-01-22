import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { VersionTimeline } from "@/components/studio/VersionTimeline";
import {
  useScriptRunDetail,
  useScriptVersionChain,
  useAccountConfigForScript,
  getStatusInfo,
  hasHardBlocks,
} from "@/hooks/use-studio";

export default function Studio() {
  const { scriptRunId } = useParams<{ scriptRunId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading, hasRole } = useAuth();

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(scriptRunId);
  const [copiedId, setCopiedId] = useState(false);
  const [userHasAccess, setUserHasAccess] = useState<boolean | null>(null);

  // Check role access with proper useEffect
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

  // Use selected version or fall back to URL param
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

  const { data: accountConfig } = useAccountConfigForScript(scriptRun?.account_id);

  const handleCopyId = () => {
    if (activeScriptId) {
      navigator.clipboard.writeText(activeScriptId);
      setCopiedId(true);
      toast({ title: "Copied script ID" });
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleVersionSelect = (scriptId: string) => {
    setSelectedVersionId(scriptId);
    // Update URL using React Router (keeps state consistent)
    navigate(`/studio/${scriptId}`, { replace: true });
  };

  // Parse script content safely
  const scriptContent = scriptRun?.script_content as Record<string, unknown> | null;
  const hook = (scriptContent?.hook as string) || "";
  const voiceover = (scriptContent?.voiceover as string) || "";
  const cta = (scriptContent?.cta as string) || "";
  const hashtags = (scriptContent?.hashtags as string[]) || [];
  const scenePrompts = (scriptContent?.scene_prompts as string[]) || [];

  const statusInfo = scriptRun ? getStatusInfo(scriptRun) : null;
  const isHardBlock = scriptRun ? hasHardBlocks(scriptRun) : false;

  // Loading state (including role check in progress)
  if (authLoading || scriptLoading || (user && userHasAccess === null)) {
    return (
      <div className="min-h-screen bg-background">
        <StudioHeader />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {user ? "Checking access..." : "Loading..."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auth required
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <StudioHeader />
        <div className="container mx-auto px-4 py-12">
          <Card className="glass-card max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Sign in with a QA or admin role to access the Studio.
              </p>
              <Button asChild>
                <Link to="/login">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Role check
  if (userHasAccess === false) {
    return (
      <div className="min-h-screen bg-background">
        <StudioHeader />
        <div className="container mx-auto px-4 py-12">
          <Card className="glass-card max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You need admin or QA role to access the Studio.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Script not found
  if (scriptError || !scriptRun) {
    return (
      <div className="min-h-screen bg-background">
        <StudioHeader />
        <div className="container mx-auto px-4 py-12">
          <Card className="glass-card max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Script Not Found</h2>
              <p className="text-sm text-muted-foreground mb-4">
                The requested script could not be found.
              </p>
              <Button variant="outline" asChild>
                <Link to="/qa-review">Back to QA Review</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StudioHeader />

      <div className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/qa-review")}
          >
            <ArrowLeft className="h-4 w-4" />
            QA Review
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">Studio</span>
          <span className="text-muted-foreground">/</span>
          <button
            onClick={handleCopyId}
            className="flex items-center gap-1 text-foreground hover:text-primary transition-colors font-mono text-xs"
          >
            {activeScriptId?.slice(0, 8)}...
            {copiedId ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>

        {/* Three column layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Rail - Version Timeline */}
          <div className="col-span-3">
            <Card className="glass-card h-[calc(100vh-200px)] sticky top-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Versions</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-60px)]">
                <VersionTimeline
                  chain={versionChain || []}
                  currentScriptId={activeScriptId || ""}
                  onSelectVersion={handleVersionSelect}
                  isLoading={chainLoading}
                />
              </CardContent>
            </Card>
          </div>

          {/* Center - Script Content (Read-only for Phase 1) */}
          <div className="col-span-6 space-y-4">
            {/* Status & Meta */}
            <Card className="glass-card">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {statusInfo && (
                      <Badge
                        variant={
                          statusInfo.variant === "destructive"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          statusInfo.variant === "success"
                            ? "bg-success text-success-foreground"
                            : statusInfo.variant === "warning"
                            ? "bg-warning/20 text-warning border-warning/30"
                            : ""
                        }
                      >
                        {statusInfo.label}
                      </Badge>
                    )}
                    {accountConfig && (
                      <Badge variant="outline" className="capitalize">
                        {accountConfig.vertical}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {scriptRun.account_id}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(scriptRun.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Flags display */}
                {(scriptRun.safety_flags?.length > 0 ||
                  scriptRun.hard_block_flags?.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {scriptRun.hard_block_flags?.map((flag, i) => (
                      <Badge key={`hb-${i}`} variant="destructive" className="text-[10px]">
                        {flag}
                      </Badge>
                    ))}
                    {scriptRun.safety_flags?.map((flag, i) => (
                      <Badge
                        key={`sf-${i}`}
                        variant="outline"
                        className="text-[10px] border-warning/50 text-warning"
                      >
                        {flag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hook */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Hook
                  <span className="text-xs text-muted-foreground font-normal">
                    ({hook.length} chars)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{hook || "No hook content"}</p>
              </CardContent>
            </Card>

            {/* Voiceover */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Voiceover
                  <span className="text-xs text-muted-foreground font-normal">
                    ({voiceover.split(/\s+/).filter(Boolean).length} words)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {voiceover || "No voiceover content"}
                </p>
              </CardContent>
            </Card>

            {/* CTA */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Call to Action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{cta || "No CTA"}</p>
              </CardContent>
            </Card>

            {/* Hashtags */}
            {hashtags.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Hashtags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scene Prompts */}
            {scenePrompts.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Scene Prompts ({scenePrompts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {scenePrompts.map((prompt, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-secondary/30 text-xs text-muted-foreground"
                      >
                        <span className="text-foreground font-medium mr-2">
                          Scene {i + 1}:
                        </span>
                        {prompt}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* QA Results */}
            {scriptRun.qa_results && (
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">QA Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs text-muted-foreground overflow-auto max-h-48 p-2 rounded bg-secondary/30">
                    {JSON.stringify(scriptRun.qa_results, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Rail - Actions (Placeholder for Phase 2+) */}
          <div className="col-span-3">
            <Card className="glass-card sticky top-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground text-center py-8">
                  <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin opacity-50" />
                  Actions coming in Phase 2
                  <div className="mt-2 space-y-1 text-left opacity-60">
                    <div>• Regenerate presets</div>
                    <div>• Generate variants</div>
                    <div>• Approve override</div>
                    <div>• Queue video job</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-foreground hover:text-primary transition-colors">
            Content Engine
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-primary">Rendition Studio</span>
        </div>
        <AuthHeader />
      </div>
    </header>
  );
}
