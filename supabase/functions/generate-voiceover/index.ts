import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  script_run_id: string;
  voice?: string;
  instructions?: string;
  provider?: "elevenlabs" | "openai";
  response_format?: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
}

// ElevenLabs voice IDs - high quality narration voices
const ELEVENLABS_VOICES: Record<string, string> = {
  // Primary narration voices
  "roger": "CwhRBWXzGAHq8TQ4Fs17",    // Deep, authoritative
  "sarah": "EXAVITQu4vr4xnSDxMaL",    // Warm, friendly
  "charlie": "IKne3meq5aSn9XLyUdCD",  // Young, energetic
  "george": "JBFqnCBsd6RMkjVDRZzb",   // British, refined
  "liam": "TX3LPaxmHKxFdv7VOQHJ",     // Neutral, clear
  "jessica": "cgSgspJ2msm6clMCkdW9",  // Warm, conversational
  "eric": "cjVigY5qzO86Huf0OWal",     // Professional, smooth
  "brian": "nPczCjzI2devNBz1zQrb",    // Deep, dramatic
  // Character voices
  "lily": "pFZP5JQG7iQjIQuC4Bku",     // Soft, intimate
  "chris": "iP95p4xoKVk53GoZ742B",    // Casual, relatable
};

// OpenAI fallback voices
const OPENAI_VOICES = ["coral", "sage", "ash", "ballad", "verse", "alloy", "echo", "shimmer"] as const;

/**
 * Generate voiceover using ElevenLabs (primary) or OpenAI (fallback)
 */
async function generateWithElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  return response.arrayBuffer();
}

async function generateWithOpenAI(
  text: string,
  voice: string,
  instructions: string | undefined,
  apiKey: string,
  responseFormat: string
): Promise<ArrayBuffer> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: instructions || "Clear, energetic, social-media narration. Natural pacing with slight emphasis on key points.",
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  return response.arrayBuffer();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const { 
      script_run_id, 
      voice = "roger", 
      instructions, 
      provider = "elevenlabs",
      response_format = "mp3" 
    } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
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

    let audioBuf: ArrayBuffer;
    let usedProvider = provider;
    let usedVoice = voice;

    // Try ElevenLabs first if requested and available
    if (provider === "elevenlabs" && elevenlabsApiKey) {
      const voiceId = ELEVENLABS_VOICES[voice.toLowerCase()] || ELEVENLABS_VOICES["roger"];
      
      try {
        console.log(`Generating TTS with ElevenLabs voice ${voice} (${voiceId})`);
        audioBuf = await generateWithElevenLabs(voiceoverText, voiceId, elevenlabsApiKey);
        usedProvider = "elevenlabs";
      } catch (err) {
        console.error("ElevenLabs failed, falling back to OpenAI:", err);
        
        if (!openaiApiKey) {
          throw new Error("ElevenLabs failed and no OpenAI fallback available");
        }
        
        // Fallback to OpenAI
        const openaiVoice = OPENAI_VOICES.includes(voice as typeof OPENAI_VOICES[number]) 
          ? voice 
          : "coral";
        
        audioBuf = await generateWithOpenAI(voiceoverText, openaiVoice, instructions, openaiApiKey, response_format);
        usedProvider = "openai";
        usedVoice = openaiVoice;
      }
    } else if (openaiApiKey) {
      // Use OpenAI directly
      const openaiVoice = OPENAI_VOICES.includes(voice as typeof OPENAI_VOICES[number]) 
        ? voice 
        : "coral";
      
      console.log(`Generating TTS with OpenAI voice ${openaiVoice}`);
      audioBuf = await generateWithOpenAI(voiceoverText, openaiVoice, instructions, openaiApiKey, response_format);
      usedProvider = "openai";
      usedVoice = openaiVoice;
    } else {
      throw new Error("No TTS provider available. Configure ELEVENLABS_API_KEY or OPENAI_API_KEY.");
    }

    // Upload to Supabase Storage
    const storagePath = `voiceover/${script_run_id}.mp3`;
    const audioBytes = new Uint8Array(audioBuf);

    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(storagePath, audioBytes, {
        upsert: true,
        contentType: "audio/mpeg",
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
        voiceover_audio_format: "mp3",
        voiceover_voice: usedVoice,
        voiceover_provider: usedProvider,
        voiceover_instructions: instructions || null,
        voiceover_generated_at: new Date().toISOString(),
      })
      .eq("id", script_run_id);

    if (updateError) {
      console.error("Failed to update script_runs:", updateError);
      // Don't throw - audio was generated successfully
    }

    console.log(`TTS generated successfully with ${usedProvider}: ${audioUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        audio_url: audioUrl,
        format: "mp3",
        voice: usedVoice,
        provider: usedProvider,
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
