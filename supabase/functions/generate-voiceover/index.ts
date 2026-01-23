import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  script_run_id: string;
  voice?: string;
  instructions?: string;
  response_format?: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
}

const AVAILABLE_VOICES = ["coral", "sage", "ash", "ballad", "verse", "alloy", "echo", "shimmer"] as const;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const { script_run_id, voice = "coral", instructions, response_format = "mp3" } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Validate voice
    if (!AVAILABLE_VOICES.includes(voice as typeof AVAILABLE_VOICES[number])) {
      throw new Error(`Invalid voice. Available: ${AVAILABLE_VOICES.join(", ")}`);
    }

    // Fetch the script run to get voiceover text
    const { data: scriptRun, error: fetchError } = await supabase
      .from("script_runs")
      .select("script_content")
      .eq("id", script_run_id)
      .single();

    if (fetchError || !scriptRun) {
      throw new Error(`Failed to fetch script run: ${fetchError?.message || "Not found"}`);
    }

    const scriptContent = scriptRun.script_content as Record<string, unknown>;
    const voiceoverText = scriptContent?.voiceover as string;

    if (!voiceoverText || voiceoverText.trim().length === 0) {
      throw new Error("Script has no voiceover text to generate audio from");
    }

    console.log(`Generating TTS for script ${script_run_id} with voice ${voice}`);

    // Call OpenAI TTS API
    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: voiceoverText,
        instructions: instructions || "Clear, energetic, social-media narration. Natural pacing with slight emphasis on key points.",
        response_format,
      }),
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      throw new Error(`OpenAI TTS failed: ${ttsResponse.status} ${errText.slice(0, 200)}`);
    }

    // Get audio as binary
    const audioBuf = new Uint8Array(await ttsResponse.arrayBuffer());

    // Determine content type
    const contentTypeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      opus: "audio/opus",
      aac: "audio/aac",
      flac: "audio/flac",
      pcm: "audio/pcm",
    };
    const contentType = contentTypeMap[response_format] || "audio/mpeg";

    // Upload to Supabase Storage
    const storagePath = `voiceover/${script_run_id}.${response_format}`;

    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(storagePath, audioBuf, {
        upsert: true,
        contentType,
      });

    if (uploadError) {
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("audio")
      .getPublicUrl(storagePath);

    const audioUrl = publicUrlData.publicUrl;

    // Update script_runs with audio metadata
    const { error: updateError } = await supabase
      .from("script_runs")
      .update({
        voiceover_audio_url: audioUrl,
        voiceover_audio_format: response_format,
        voiceover_voice: voice,
        voiceover_instructions: instructions || null,
        voiceover_generated_at: new Date().toISOString(),
      })
      .eq("id", script_run_id);

    if (updateError) {
      throw new Error(`Failed to update script_runs: ${updateError.message}`);
    }

    console.log(`TTS generated successfully: ${audioUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        audio_url: audioUrl,
        format: response_format,
        voice,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("generate-voiceover error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
