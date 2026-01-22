import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ScriptRun, QAResult } from "@/types/script-types";

// Mock QA inbox data (in production, would come from Supabase)
const MOCK_QA_INBOX: Array<ScriptRun & { qa_results: QAResult }> = [
  {
    id: "qa-1",
    account_id: "1",
    topic_id: "topic-priv-001",
    status: "qa_failed",
    script_content: {
      hook: "Your home address is for sale right now.",
      voiceover: "Most people have no idea data brokers are selling their personal information. Here's what you can do about it...",
      on_screen_text: [{ timestamp: 2, text: "Data brokers exposed" }],
      scene_prompts: ["Person looking at phone concerned"],
      broll_keywords: ["phone", "data"],
      caption: "Your data is being sold. Check your footprint.",
      hashtags: ["privacy", "datasecurity"],
      cta: "Check your digital footprint",
    },
    qa_results: {
      passed: false,
      checks: {
        structure_valid: true,
        length_valid: true,
        banned_topics_clear: false,
        claim_policy_compliant: true,
        disclaimer_present: true,
        uniqueness_valid: true,
      },
      errors: ["Banned topics found: fear mongering"],
      warnings: [],
    },
    qa_failed_reason: "Banned topics found: fear mongering",
    safety_flags: [],
    fact_claims: [],
    generation_cost_cents: 1,
    hook_hash: "abc123",
    voiceover_hash: "def456",
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "qa-2",
    account_id: "5",
    topic_id: "topic-health-001",
    status: "qa_failed",
    script_content: {
      hook: "This exercise will cure your symptoms.",
      voiceover: "Try this simple exercise to heal faster...",
      on_screen_text: [{ timestamp: 2, text: "Recovery exercise" }],
      scene_prompts: ["Person doing stretches"],
      broll_keywords: ["exercise", "recovery"],
      caption: "Heal faster with this exercise",
      hashtags: ["recovery", "stroke"],
      cta: "Join our community",
    },
    qa_results: {
      passed: false,
      checks: {
        structure_valid: true,
        length_valid: true,
        banned_topics_clear: false,
        claim_policy_compliant: false,
        disclaimer_present: false,
        uniqueness_valid: true,
      },
      errors: [
        "Health claim violation: \"cure\" not allowed",
        "Health claim violation: \"heal\" not allowed",
        "Health content requires disclaimer"
      ],
      warnings: [],
    },
    qa_failed_reason: "Multiple health policy violations",
    safety_flags: ["MEDICAL_CURE_CLAIM", "EXERCISE_INSTRUCTION"],
    fact_claims: [],
    generation_cost_cents: 1,
    hook_hash: "ghi789",
    voiceover_hash: "jkl012",
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "qa-3",
    account_id: "3",
    topic_id: "topic-edu-001",
    status: "qa_failed",
    script_content: {
      hook: "Did you know this tip?",
      voiceover: "Here's something you should know about resumes...",
      on_screen_text: [{ timestamp: 2, text: "Resume tip" }],
      scene_prompts: ["Person at laptop"],
      broll_keywords: ["resume", "laptop"],
      caption: "Resume tip you need",
      hashtags: ["career", "resume"],
      cta: "Get the template",
    },
    qa_results: {
      passed: false,
      checks: {
        structure_valid: false,
        length_valid: true,
        banned_topics_clear: true,
        claim_policy_compliant: true,
        disclaimer_present: true,
        uniqueness_valid: true,
      },
      errors: ["Hook is too vague: matches pattern \"^did\\s+you\\s+know\\s+this\\??$\""],
      warnings: ["Hook lacks concrete objects"],
    },
    qa_failed_reason: "Hook quality check failed",
    safety_flags: [],
    fact_claims: [],
    generation_cost_cents: 1,
    hook_hash: "mno345",
    voiceover_hash: "pqr678",
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

const VERTICALS = ["all", "privacy", "education", "health"];

export default function QAReviewInbox() {
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const filteredItems = useMemo(() => {
    return MOCK_QA_INBOX.filter(item => {
      // Vertical filter
      if (verticalFilter !== "all") {
        const accountVertical = item.account_id === "1" || item.account_id === "2" ? "privacy"
          : item.account_id === "3" || item.account_id === "4" || item.account_id === "7" ? "education"
          : "health";
        if (accountVertical !== verticalFilter) return false;
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchFields = [
          item.qa_failed_reason,
          item.script_content.hook,
          ...item.safety_flags,
          ...item.qa_results.errors,
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!searchFields.includes(query)) return false;
      }
      
      // Hide approved items
      if (approvedIds.has(item.id)) return false;
      
      return true;
    });
  }, [verticalFilter, searchQuery, approvedIds]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRegenerate = (id: string) => {
    console.log("Regenerating script:", id);
    // In production: call generateScriptRun with same topic
  };

  const handleApproveOverride = (id: string) => {
    const reason = prompt("Enter override reason (admin only):");
    if (reason) {
      console.log("Override approved:", id, reason);
      setApprovedIds(prev => new Set(prev).add(id));
    }
  };

  const stats = {
    total: MOCK_QA_INBOX.length - approvedIds.size,
    byFlag: {
      health: MOCK_QA_INBOX.filter(i => 
        i.safety_flags.some(f => f.includes("MEDICAL") || f.includes("EXERCISE"))
      ).length,
      hook: MOCK_QA_INBOX.filter(i => 
        i.qa_results.errors.some(e => e.toLowerCase().includes("hook"))
      ).length,
      banned: MOCK_QA_INBOX.filter(i => 
        i.qa_results.errors.some(e => e.toLowerCase().includes("banned"))
      ).length,
    },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              <div className="h-8 w-px bg-border" />
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-warning" />
                  QA Review Inbox
                </h1>
                <p className="text-sm text-muted-foreground">
                  {stats.total} scripts pending review
                </p>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline" className="text-destructive border-destructive/50">
                Health: {stats.byFlag.health}
              </Badge>
              <Badge variant="outline" className="text-warning border-warning/50">
                Hook: {stats.byFlag.hook}
              </Badge>
              <Badge variant="outline">
                Banned: {stats.byFlag.banned}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Filters:</span>
              </div>
              
              <Select value={verticalFilter} onValueChange={setVerticalFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Vertical" />
                </SelectTrigger>
                <SelectContent>
                  {VERTICALS.map(v => (
                    <SelectItem key={v} value={v}>
                      {v === "all" ? "All verticals" : v.charAt(0).toUpperCase() + v.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search errors, flags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Review Items */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-30 text-success" />
                <p className="text-lg font-medium text-success">All caught up!</p>
                <p className="text-sm">No scripts pending review</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.map(item => (
              <QAReviewCard
                key={item.id}
                item={item}
                isExpanded={expandedIds.has(item.id)}
                onToggle={() => toggleExpanded(item.id)}
                onRegenerate={() => handleRegenerate(item.id)}
                onApproveOverride={() => handleApproveOverride(item.id)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function QAReviewCard({
  item,
  isExpanded,
  onToggle,
  onRegenerate,
  onApproveOverride,
}: {
  item: ScriptRun & { qa_results: QAResult };
  isExpanded: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  onApproveOverride: () => void;
}) {
  const hasCriticalFlags = item.safety_flags.some(f => 
    f.includes("MEDICAL") || f.includes("ILLEGAL")
  );

  return (
    <Card className={cn(
      "glass-card overflow-hidden",
      hasCriticalFlags ? "border-destructive/50" : "border-warning/50"
    )}>
      <div 
        className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className={cn(
                "w-5 h-5 shrink-0",
                hasCriticalFlags ? "text-destructive" : "text-warning"
              )} />
              <span className="text-sm font-medium truncate">
                Account {item.account_id}
              </span>
              <Badge variant="outline" className="text-xs">
                {new Date(item.created_at).toLocaleTimeString()}
              </Badge>
            </div>
            
            <p className="text-sm mb-2 line-clamp-1">
              <span className="text-muted-foreground">Hook:</span>{" "}
              {item.script_content.hook}
            </p>
            
            <div className="flex flex-wrap gap-2">
              {item.safety_flags.slice(0, 2).map((flag, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    flag.includes("MEDICAL") || flag.includes("ILLEGAL")
                      ? "text-destructive border-destructive/50"
                      : "text-warning border-warning/50"
                  )}
                >
                  {flag}
                </Badge>
              ))}
              {item.safety_flags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{item.safety_flags.length - 2} more
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {/* Errors */}
          <div className="p-3 rounded-lg bg-destructive/10">
            <h4 className="text-sm font-semibold text-destructive mb-2">QA Errors</h4>
            <ul className="text-sm space-y-1">
              {item.qa_results.errors.map((error, i) => (
                <li key={i} className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Check Results */}
          <div>
            <h4 className="text-sm font-semibold mb-2">QA Checks</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {Object.entries(item.qa_results.checks).map(([key, passed]) => (
                <div key={key} className="flex items-center gap-2">
                  {passed ? (
                    <CheckCircle className="w-3 h-3 text-success" />
                  ) : (
                    <XCircle className="w-3 h-3 text-destructive" />
                  )}
                  <span className="text-muted-foreground">
                    {key.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Voiceover Preview */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Voiceover</h4>
            <p className="text-sm text-muted-foreground bg-secondary/20 p-3 rounded-lg">
              {item.script_content.voiceover}
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={onRegenerate} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </Button>
            <Button 
              variant="outline" 
              onClick={onApproveOverride}
              disabled={hasCriticalFlags}
              className="gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Approve Override
            </Button>
            {hasCriticalFlags && (
              <span className="text-xs text-destructive self-center ml-2">
                Critical flags cannot be overridden
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
