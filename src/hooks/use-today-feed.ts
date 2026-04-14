import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PostSlotStatus = "idea" | "generating" | "ready" | "approved" | "rejected";

export interface PostSlot {
  id: string;
  status: PostSlotStatus;
  title: string | null;
  contentType: string;
  assembledVideoUrl: string | null;
  storyJobId: string | null;
  ideaId: string | null;
  createdAt: string;
}

export interface AccountFeedItem {
  accountId: string;
  accountName: string | null;
  handle: string | null;
  platform: string;
  vertical: string;
  hookStyle: string;
  maxDailyPosts: number;
  slots: PostSlot[];
  stats: {
    ready: number;
    generating: number;
    ideas: number;
    approved: number;
  };
}

export interface TodaySummary {
  totalReady: number;
  totalGenerating: number;
  totalIdeasLow: number;
  totalApproved: number;
}

function getStartOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function mapJobToSlot(job: any): PostSlot {
  let status: PostSlotStatus = "generating";
  if (job.review_status === "approved") status = "approved";
  else if (job.review_status === "rejected") status = "rejected";
  else if (job.assembled_video_url) status = "ready";
  else if (["pending", "generating", "assembling"].includes(job.status)) status = "generating";

  return {
    id: job.id,
    status,
    title: job.title,
    contentType: job.content_type,
    assembledVideoUrl: job.assembled_video_url,
    storyJobId: job.id,
    ideaId: job.source_idea_id,
    createdAt: job.created_at,
  };
}

function mapIdeaToSlot(idea: any): PostSlot {
  return {
    id: idea.id,
    status: "idea",
    title: idea.title,
    contentType: idea.content_type,
    assembledVideoUrl: null,
    storyJobId: null,
    ideaId: idea.id,
    createdAt: idea.created_at,
  };
}

export function useTodayFeed() {
  return useQuery({
    queryKey: ["today-feed"],
    queryFn: async () => {
      const todayStart = getStartOfToday();

      // Fetch all active accounts
      const { data: accounts, error: accErr } = await supabase
        .from("account_configs")
        .select("*")
        .eq("status", "active")
        .order("priority_score", { ascending: false });
      if (accErr) throw accErr;

      // Fetch today's story_jobs
      const { data: jobs, error: jobErr } = await supabase
        .from("story_jobs")
        .select("id, account_id, title, content_type, status, review_status, assembled_video_url, source_idea_id, created_at")
        .gte("created_at", todayStart)
        .order("created_at", { ascending: false });
      if (jobErr) throw jobErr;

      // Fetch proposed ideas (up to 5 per account as fallback)
      const { data: ideas, error: ideaErr } = await supabase
        .from("content_ideas")
        .select("id, account_id, title, content_type, created_at")
        .eq("status", "proposed")
        .order("opportunity_score", { ascending: false })
        .limit(200);
      if (ideaErr) throw ideaErr;

      // Group by account
      const jobsByAccount = new Map<string, any[]>();
      for (const j of jobs || []) {
        const arr = jobsByAccount.get(j.account_id) || [];
        arr.push(j);
        jobsByAccount.set(j.account_id, arr);
      }

      const ideasByAccount = new Map<string, any[]>();
      const usedIdeaIds = new Set((jobs || []).map((j: any) => j.source_idea_id).filter(Boolean));
      for (const i of ideas || []) {
        if (usedIdeaIds.has(i.id)) continue;
        const arr = ideasByAccount.get(i.account_id) || [];
        if (arr.length < 5) arr.push(i);
        ideasByAccount.set(i.account_id, arr);
      }

      let totalReady = 0;
      let totalGenerating = 0;
      let totalIdeasLow = 0;
      let totalApproved = 0;

      const feed: AccountFeedItem[] = (accounts || []).map((acc) => {
        const accountJobs = jobsByAccount.get(acc.account_id) || [];
        const accountIdeas = ideasByAccount.get(acc.account_id) || [];

        const jobSlots = accountJobs.map(mapJobToSlot);
        const ideaSlots = accountIdeas.map(mapIdeaToSlot);

        // Combine: jobs first, then ideas to fill up to max_daily_posts
        const maxSlots = Math.min(acc.max_daily_posts || 3, 5);
        const allSlots = [...jobSlots, ...ideaSlots].slice(0, maxSlots);

        const stats = {
          ready: jobSlots.filter((s) => s.status === "ready").length,
          generating: jobSlots.filter((s) => s.status === "generating").length,
          ideas: ideaSlots.length,
          approved: jobSlots.filter((s) => s.status === "approved").length,
        };

        totalReady += stats.ready;
        totalGenerating += stats.generating;
        totalApproved += stats.approved;
        if (accountIdeas.length < 3) totalIdeasLow++;

        return {
          accountId: acc.account_id,
          accountName: acc.account_name,
          handle: acc.handle,
          platform: acc.platform,
          vertical: acc.vertical,
          hookStyle: acc.hook_style,
          maxDailyPosts: acc.max_daily_posts,
          slots: allSlots,
          stats,
        };
      });

      const summary: TodaySummary = {
        totalReady,
        totalGenerating,
        totalIdeasLow,
        totalApproved,
      };

      return { feed, summary };
    },
    refetchInterval: 30000,
  });
}
