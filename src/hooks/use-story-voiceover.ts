import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

export type VoiceoverStatus = "pending" | "compiling" | "compiled" | "generating" | "processing" | "done" | "failed";

// Word timing with char spans for reliable highlighting
export interface WordTiming {
  word: string;
  char_start: number;
  char_end: number;
  start_ms: number;
  end_ms: number;
}

export interface SceneTiming {
  scene_index: number;
  start_ms: number;
  end_ms: number;
  words?: WordTiming[];
}

export interface SceneSegment {
  scene_index: number;
  text: string;
  char_start: number;
  char_end: number;
  estimated_duration_ms: number;
}

export interface StoryVoiceover {
  id: string;
  story_job_id: string;
  raw_narration: string;
  compiled_script: string | null;
  scene_segments: SceneSegment[];
  ssml_content: string | null;
  provider: string;
  voice_id: string;
  voice_name: string | null;
  voice_settings: Record<string, number>;
  predicted_timing: SceneTiming[];
  actual_timing: SceneTiming[];
  total_duration_ms: number | null;
  audio_url: string | null;
  audio_format: string;
  status: VoiceoverStatus;
  error: string | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompileScriptParams {
  story_job_id: string;
  voice_id?: string;
  voice_name?: string;
  voice_settings?: Record<string, number>;
}

export interface GenerateVoiceoverParams {
  voiceover_id: string;
}

// Voice presets for the UI
export const VOICE_PRESETS = {
  myth: {
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_name: "George",
    description: "British, refined - perfect for mythic narration",
    settings: { stability: 0.7, similarity_boost: 0.75, style: 0.5 },
  },
  film_continuity: {
    voice_id: "CwhRBWXzGAHq8TQ4Fs17",
    voice_name: "Roger",
    description: "Documentary style - observational and clear",
    settings: { stability: 0.65, similarity_boost: 0.75, style: 0.4 },
  },
  short_story: {
    voice_id: "nPczCjzI2devNBz1zQrb",
    voice_name: "Brian",
    description: "Dramatic - deep and engaging",
    settings: { stability: 0.6, similarity_boost: 0.8, style: 0.6 },
  },
} as const;

// ============================================
// Query Hook - Fetch Active Voiceover
// ============================================

export function useStoryVoiceover(storyJobId: string | undefined) {
  return useQuery({
    queryKey: ["story-voiceover", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return null;

      const { data, error } = await supabase
        .from("story_voiceovers")
        .select("*")
        .eq("story_job_id", storyJobId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("Error fetching voiceover:", error);
        return null;
      }

      return data as unknown as StoryVoiceover | null;
    },
    enabled: !!storyJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll while in progress
      if (status === "compiling" || status === "generating" || status === "processing") {
        return 2000;
      }
      return false;
    },
  });
}

// ============================================
// Query Hook - Fetch All Voiceovers for Story
// ============================================

export function useStoryVoiceoverHistory(storyJobId: string | undefined) {
  return useQuery({
    queryKey: ["story-voiceover-history", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return [];

      const { data, error } = await supabase
        .from("story_voiceovers")
        .select("*")
        .eq("story_job_id", storyJobId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching voiceover history:", error);
        return [];
      }

      return data as unknown as StoryVoiceover[];
    },
    enabled: !!storyJobId,
  });
}

// ============================================
// Mutation - Compile Script
// ============================================

export function useCompileScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CompileScriptParams) => {
      const { data, error } = await supabase.functions.invoke("compile-story-script", {
        body: params,
      });

      if (error) {
        throw new Error(error.message || "Failed to compile script");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Compilation failed");
      }

      return data;
    },
    onSuccess: (data, params) => {
      toast.success("Script compiled", {
        description: `${data.scene_segments?.length || 0} segments ready for voiceover`,
      });
      queryClient.invalidateQueries({ queryKey: ["story-voiceover", params.story_job_id] });
    },
    onError: (error) => {
      toast.error("Script compilation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================
// Mutation - Generate Voiceover
// ============================================

export function useGenerateVoiceover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: GenerateVoiceoverParams) => {
      const { data, error } = await supabase.functions.invoke("generate-story-voiceover", {
        body: params,
      });

      if (error) {
        throw new Error(error.message || "Failed to generate voiceover");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Voiceover generation failed");
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success("Voiceover generated", {
        description: `Duration: ${((data.total_duration_ms || 0) / 1000).toFixed(1)}s`,
      });
      // Invalidate based on voiceover_id's story
      queryClient.invalidateQueries({ queryKey: ["story-voiceover"] });
    },
    onError: (error) => {
      toast.error("Voiceover generation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================
// Combined Hook - Full Voiceover Flow
// ============================================

export function useStoryNarration(storyJobId: string | undefined, storyType?: string) {
  const voiceoverQuery = useStoryVoiceover(storyJobId);
  const compileScript = useCompileScript();
  const generateVoiceover = useGenerateVoiceover();

  const voiceover = voiceoverQuery.data;
  const isLoading = voiceoverQuery.isLoading;
  const isCompiling = compileScript.isPending || voiceover?.status === "compiling";
  const isGenerating = generateVoiceover.isPending || voiceover?.status === "generating" || voiceover?.status === "processing";
  const hasScript = !!voiceover?.compiled_script;
  const hasAudio = !!voiceover?.audio_url;

  // Get recommended voice preset based on story type
  const recommendedVoice = storyType && storyType in VOICE_PRESETS
    ? VOICE_PRESETS[storyType as keyof typeof VOICE_PRESETS]
    : VOICE_PRESETS.myth;

  const compile = async (options?: { voice_id?: string; voice_name?: string }) => {
    if (!storyJobId) return;
    
    return compileScript.mutateAsync({
      story_job_id: storyJobId,
      voice_id: options?.voice_id || recommendedVoice.voice_id,
      voice_name: options?.voice_name || recommendedVoice.voice_name,
      voice_settings: recommendedVoice.settings,
    });
  };

  const generate = async () => {
    if (!voiceover?.id) {
      throw new Error("No voiceover to generate. Compile script first.");
    }
    return generateVoiceover.mutateAsync({ voiceover_id: voiceover.id });
  };

  const compileAndGenerate = async (options?: { voice_id?: string; voice_name?: string }) => {
    const result = await compile(options);
    if (result?.voiceover_id) {
      return generateVoiceover.mutateAsync({ voiceover_id: result.voiceover_id });
    }
  };

  // Find current word based on time using char spans (not string matching)
  const findCurrentWord = (currentTimeMs: number): { word: WordTiming | null; sceneIndex: number | null } => {
    const timing = voiceover?.actual_timing;
    if (!timing) return { word: null, sceneIndex: null };

    for (const scene of timing) {
      if (currentTimeMs >= scene.start_ms && currentTimeMs <= scene.end_ms) {
        if (scene.words?.length) {
          const word = scene.words.find(
            (w) => currentTimeMs >= w.start_ms && currentTimeMs <= w.end_ms
          );
          return { word: word || null, sceneIndex: scene.scene_index };
        }
        return { word: null, sceneIndex: scene.scene_index };
      }
    }

    return { word: null, sceneIndex: null };
  };

  return {
    // Data
    voiceover,
    compiledScript: voiceover?.compiled_script,
    sceneSegments: voiceover?.scene_segments || [],
    audioUrl: voiceover?.audio_url,
    actualTiming: voiceover?.actual_timing || [],
    totalDurationMs: voiceover?.total_duration_ms,
    
    // Status
    status: voiceover?.status || "none",
    error: voiceover?.error,
    isLoading,
    isCompiling,
    isGenerating,
    isProcessing: isCompiling || isGenerating,
    hasScript,
    hasAudio,
    
    // Voice
    voiceId: voiceover?.voice_id || recommendedVoice.voice_id,
    voiceName: voiceover?.voice_name || recommendedVoice.voice_name,
    recommendedVoice,
    
    // Actions
    compile,
    generate,
    compileAndGenerate,
    findCurrentWord,
    refetch: voiceoverQuery.refetch,
  };
}
