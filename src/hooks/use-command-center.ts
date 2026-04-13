/**
 * Command Center data hook
 * 
 * Aggregates actionable intelligence across products, ideas, videos, and trends
 * to answer: "What should I do right now?"
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActionItem {
  id: string;
  type: "product_approve" | "product_research" | "idea_approve" | "video_review" | "plan_generate" | "product_hot" | "winner_scale" | "loser_cut" | "assign_accounts";
  priority: number; // 0-100, higher = more urgent
  title: string;
  subtitle: string;
  metadata: Record<string, any>;
}

export interface CommandCenterData {
  actions: ActionItem[];
  stats: {
    productsDiscovered: number;
    productsApproved: number;
    productsActive: number;
    ideasProposed: number;
    ideasApproved: number;
    videosAwaitingReview: number;
    storiesGenerating: number;
    plansReady: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    score: number;
    status: string;
    trending_status: string | null;
    margin: number | null;
    image_url: string | null;
    has_plan: boolean;
    linked_ideas: number;
  }>;
}

export function useCommandCenter() {
  return useQuery({
    queryKey: ["command-center"],
    queryFn: async (): Promise<CommandCenterData> => {
      const [productsRes, ideasRes, storiesRes, analysisRes, outcomesRes] = await Promise.all([
        supabase.from("products").select("id, name, status, image_url, estimated_margin_pct, plan_status, plan_version, marketing_plan, price_cents").order("created_at", { ascending: false }),
        supabase.from("content_ideas").select("id, title, status, product_id, opportunity_score, angle, suggested_format").order("created_at", { ascending: false }).limit(200),
        supabase.from("story_jobs").select("id, title, status, review_status, assembled_status, assembled_video_url, product_id").order("created_at", { ascending: false }).limit(100),
        supabase.from("product_analysis").select("product_id, overall_score, trending_status, wow_factor, social_media_potential, impulse_buy_appeal, demonstrability_score, competition_level"),
        supabase.from("prompt_outcomes").select("id, story_job_id, outcome_score, views, likes, shares, saves, platform").order("created_at", { ascending: false }).limit(100),
      ]);

      const products = productsRes.data || [];
      const ideas = ideasRes.data || [];
      const stories = storiesRes.data || [];
      const analyses = analysisRes.data || [];
      const outcomes = outcomesRes.data || [];

      // Build analysis lookup
      const analysisMap = new Map(analyses.map(a => [a.product_id, a]));

      // Build linked ideas count per product
      const productIdeaCount = new Map<string, number>();
      ideas.forEach(i => {
        if (i.product_id) {
          productIdeaCount.set(i.product_id, (productIdeaCount.get(i.product_id) || 0) + 1);
        }
      });

      // Stats
      const stats = {
        productsDiscovered: products.filter(p => p.status === "discovered").length,
        productsApproved: products.filter(p => p.status === "approved").length,
        productsActive: products.filter(p => p.status === "active").length,
        ideasProposed: ideas.filter(i => i.status === "proposed").length,
        ideasApproved: ideas.filter(i => i.status === "approved").length,
        videosAwaitingReview: stories.filter(s => s.assembled_status === "succeeded" && s.review_status === "pending").length,
        storiesGenerating: stories.filter(s => s.status === "generating").length,
        plansReady: products.filter(p => p.plan_status === "ready").length,
      };

      // Build actions
      const actions: ActionItem[] = [];

      // 1. Products needing research (discovered, no analysis)
      products
        .filter(p => p.status === "discovered" && !analysisMap.has(p.id))
        .forEach(p => {
          actions.push({
            id: `research-${p.id}`,
            type: "product_research",
            priority: 60,
            title: `Research "${p.name}"`,
            subtitle: "Discovered but not yet analyzed",
            metadata: { product_id: p.id },
          });
        });

      // 2. High-scoring products needing approval
      products
        .filter(p => p.status === "researching" || p.status === "discovered")
        .forEach(p => {
          const a = analysisMap.get(p.id);
          if (a && (a.overall_score ?? 0) >= 65) {
            actions.push({
              id: `approve-${p.id}`,
              type: "product_approve",
              priority: 70 + Math.min((a.overall_score ?? 0) - 65, 30),
              title: `Approve "${p.name}" — Score ${a.overall_score}`,
              subtitle: `${a.trending_status || "unknown"} trend · ${p.estimated_margin_pct ?? "?"}% margin`,
              metadata: { product_id: p.id, score: a.overall_score },
            });
          }
        });

      // 3. Approved products without a plan
      products
        .filter(p => (p.status === "approved" || p.status === "active") && p.plan_status !== "ready")
        .forEach(p => {
          actions.push({
            id: `plan-${p.id}`,
            type: "plan_generate",
            priority: 75,
            title: `Generate plan for "${p.name}"`,
            subtitle: "Approved but no marketing plan yet",
            metadata: { product_id: p.id },
        });
      });

      // 3b. Approved/active products WITH plan but few account-assigned ideas
      products
        .filter(p => (p.status === "approved" || p.status === "active") && p.plan_status === "ready")
        .forEach(p => {
          const ideaCount = productIdeaCount.get(p.id) || 0;
          // Only suggest assignment if there are very few ideas (likely only generic ones)
          if (ideaCount < 3) {
            actions.push({
              id: `assign-${p.id}`,
              type: "assign_accounts",
              priority: 72,
              title: `Assign accounts for "${p.name}"`,
              subtitle: `Has plan but only ${ideaCount} ideas — route to accounts`,
              metadata: { product_id: p.id },
            });
          }

      // 4. Ideas waiting for approval
      const proposedIdeas = ideas.filter(i => i.status === "proposed").slice(0, 5);
      if (proposedIdeas.length > 0) {
        actions.push({
          id: "ideas-batch",
          type: "idea_approve",
          priority: 55,
          title: `${stats.ideasProposed} ideas awaiting review`,
          subtitle: "Approve or reject proposed content ideas",
          metadata: { count: stats.ideasProposed },
        });
      }

      // 5. Videos awaiting review
      const reviewable = stories.filter(s => s.assembled_status === "succeeded" && s.review_status === "pending");
      if (reviewable.length > 0) {
        actions.push({
          id: "videos-review",
          type: "video_review",
          priority: 80,
          title: `${reviewable.length} video${reviewable.length > 1 ? "s" : ""} ready for review`,
          subtitle: "Assembled and waiting for your approval",
          metadata: { count: reviewable.length },
        });
      }

      // 6. Hot products (high score + rising/emerging)
      products
        .filter(p => p.status === "active")
        .forEach(p => {
          const a = analysisMap.get(p.id);
          if (a && (a.overall_score ?? 0) >= 75 && (a.trending_status === "rising" || a.trending_status === "emerging")) {
            actions.push({
              id: `hot-${p.id}`,
              type: "product_hot",
              priority: 85,
              title: `🔥 "${p.name}" is ${a.trending_status}`,
              subtitle: `Score ${a.overall_score} — create more content`,
              metadata: { product_id: p.id, score: a.overall_score },
            });
          }
        });

      // 7. Winner signals from performance data
      outcomes.forEach(o => {
        const score = o.outcome_score != null ? Number(o.outcome_score) : null;
        const views = o.views != null ? Number(o.views) : null;
        if (score != null && score >= 70 && (views ?? 0) >= 1000) {
          const job = stories.find(s => s.id === o.story_job_id);
          actions.push({
            id: `winner-${o.id}`,
            type: "winner_scale",
            priority: 90,
            title: `🏆 Winner! "${job?.title || "Video"}" — Score ${score}`,
            subtitle: `${(views ?? 0).toLocaleString()} views · Scale this content`,
            metadata: { story_job_id: o.story_job_id, outcome_score: score, views },
          });
        } else if (score != null && score < 10 && (views ?? 0) > 0) {
          const job = stories.find(s => s.id === o.story_job_id);
          actions.push({
            id: `loser-${o.id}`,
            type: "loser_cut",
            priority: 40,
            title: `❌ Cut "${job?.title || "Video"}" — Score ${score}`,
            subtitle: `Underperforming · Consider new angle`,
            metadata: { story_job_id: o.story_job_id, outcome_score: score },
          });
        }
      });

      // Sort by priority descending
      actions.sort((a, b) => b.priority - a.priority);

      // Top products (sorted by score)
      const topProducts = products
        .map(p => {
          const a = analysisMap.get(p.id);
          return {
            id: p.id,
            name: p.name,
            score: a?.overall_score ?? 0,
            status: p.status,
            trending_status: a?.trending_status ?? null,
            margin: p.estimated_margin_pct ? Number(p.estimated_margin_pct) : null,
            image_url: p.image_url,
            has_plan: p.plan_status === "ready",
            linked_ideas: productIdeaCount.get(p.id) || 0,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      return { actions, stats, topProducts };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
