/**
 * Generate Story Voiceover
 * 
 * Takes a compiled script and generates voiceover audio via ElevenLabs.
 * Supports word-level timestamps for karaoke captions.
 * 
 * Input: voiceover_id (from compile-story-script)
 * Output: audio_url with actual_timing including word-level timestamps
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  voiceover_id: string;
}

interface SceneSegment {
  scene_index: number;
  text: string;
  char_start: number;
  char_end: number;
  estimated_duration_ms: number;
}

interface WordTiming {
  word: string;
  start_ms: number;
  end_ms: number;
}

interface ActualTiming {
  scene_index: number;
  start_ms: number;
  end_ms: number;
  words: WordTiming[];
}

// ElevenLabs voice presets by story type
const VOICE_PRESETS: Record<string, { voice_id: string; voice_name: string; settings: Record<string, number> }> = {
  myth: {
    voice_id: "JBFqnCBsd6RMkjVDRZzb", // George - British, refined
    voice_name: "George",
    settings: { stability: 0.7, similarity_boost: 0.75, style: 0.5 },
  },
  film_continuity: {
    voice_id: "CwhRBWXzGAHq8TQ4Fs17", // Roger - documentary
    voice_name: "Roger",
    settings: { stability: 0.65, similarity_boost: 0.75, style: 0.4 },
  },
  short_story: {
    voice_id: "nPczCjzI2devNBz1zQrb", // Brian - dramatic
    voice_name: "Brian",
    settings: { stability: 0.6, similarity_boost: 0.8, style: 0.6 },
  },
};

function buildSSML(compiledScript: string, sceneSegments: SceneSegment[]): string {
  // Insert pauses between scenes using SSML
  let ssml = "<speak>";
  
  for (let i = 0; i < sceneSegments.length; i++) {
    const segment = sceneSegments[i];
    ssml += segment.text;
    
    // Add pause after each scene except the last
    if (i < sceneSegments.length - 1) {
      ssml += ' <break time="1.5s"/> ';
    }
  }
  
  ssml += "</speak>";
  return ssml;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: GenerateRequest = await req.json();

    if (!body.voiceover_id) {
      throw new Error("voiceover_id is required");
    }

    // Fetch voiceover record
    const { data: voiceover, error: voiceoverError } = await supabase
      .from("story_voiceovers")
      .select("*, story_jobs!inner(story_type, title)")
      .eq("id", body.voiceover_id)
      .single();

    if (voiceoverError || !voiceover) {
      throw new Error(`Voiceover not found: ${voiceoverError?.message}`);
    }

    if (!voiceover.compiled_script) {
      throw new Error("Voiceover has no compiled script. Run compile-story-script first.");
    }

    // Update status to generating
    await supabase
      .from("story_voiceovers")
      .update({ status: "generating" })
      .eq("id", voiceover.id);

    const sceneSegments = voiceover.scene_segments as SceneSegment[];
    const voiceId = voiceover.voice_id;
    const voiceSettings = voiceover.voice_settings as Record<string, number>;

    // Build SSML with scene pauses
    const ssmlContent = buildSSML(voiceover.compiled_script, sceneSegments);

    console.log(`[generate-voiceover] Generating for voiceover ${voiceover.id}`);
    console.log(`[generate-voiceover] Voice: ${voiceId}, Script length: ${voiceover.compiled_script.length} chars`);

    // Call ElevenLabs TTS with timestamps
    // Using the streaming endpoint with alignment for word-level timing
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: voiceover.compiled_script,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: voiceSettings.stability ?? 0.7,
            similarity_boost: voiceSettings.similarity_boost ?? 0.75,
            style: voiceSettings.style ?? 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: `ElevenLabs error: ${errText}` })
        .eq("id", voiceover.id);
      throw new Error(`ElevenLabs error: ${errText}`);
    }

    // ElevenLabs with-timestamps returns JSON with audio_base64 and alignment
    const ttsData = await ttsResponse.json();
    
    if (!ttsData.audio_base64) {
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: "No audio returned from ElevenLabs" })
        .eq("id", voiceover.id);
      throw new Error("No audio returned from ElevenLabs");
    }

    // Decode base64 audio
    const audioBytes = Uint8Array.from(atob(ttsData.audio_base64), c => c.charCodeAt(0));

    // Extract word-level alignment
    const alignment = ttsData.alignment as {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    } | undefined;

    // Calculate actual timing from alignment
    let actualTiming: ActualTiming[] = [];
    let totalDurationMs = 0;

    if (alignment) {
      console.log(`[generate-voiceover] Got alignment: ${alignment.characters.length} characters`);
      
      // Map character-level timing to scene segments
      for (const segment of sceneSegments) {
        const segmentWords: WordTiming[] = [];
        let segmentStartMs = Infinity;
        let segmentEndMs = 0;
        
        // Find character indices for this segment
        const text = segment.text;
        let wordStart = 0;
        const words = text.split(/\s+/);
        
        for (const word of words) {
          const wordCharStart = segment.char_start + text.indexOf(word, wordStart);
          const wordCharEnd = wordCharStart + word.length;
          wordStart = text.indexOf(word, wordStart) + word.length;
          
          // Find timing for first and last character of word
          const startIdx = Math.min(wordCharStart, alignment.characters.length - 1);
          const endIdx = Math.min(wordCharEnd - 1, alignment.characters.length - 1);
          
          if (startIdx >= 0 && startIdx < alignment.character_start_times_seconds.length) {
            const wordStartMs = Math.floor(alignment.character_start_times_seconds[startIdx] * 1000);
            const wordEndMs = Math.floor(alignment.character_end_times_seconds[endIdx] * 1000);
            
            segmentWords.push({
              word,
              start_ms: wordStartMs,
              end_ms: wordEndMs,
            });
            
            segmentStartMs = Math.min(segmentStartMs, wordStartMs);
            segmentEndMs = Math.max(segmentEndMs, wordEndMs);
          }
        }
        
        actualTiming.push({
          scene_index: segment.scene_index,
          start_ms: segmentStartMs === Infinity ? 0 : segmentStartMs,
          end_ms: segmentEndMs,
          words: segmentWords,
        });
        
        totalDurationMs = Math.max(totalDurationMs, segmentEndMs);
      }
    } else {
      // Fallback: use predicted timing if no alignment available
      console.log(`[generate-voiceover] No alignment data, using predicted timing`);
      actualTiming = (voiceover.predicted_timing as ActualTiming[]).map(t => ({
        ...t,
        words: [],
      }));
      totalDurationMs = actualTiming.length > 0 
        ? actualTiming[actualTiming.length - 1].end_ms 
        : 0;
    }

    // Upload audio to Supabase Storage
    const fileName = `voiceovers/stories/${voiceover.story_job_id}/${voiceover.id}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(fileName, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: `Upload error: ${uploadError.message}` })
        .eq("id", voiceover.id);
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("audio")
      .getPublicUrl(fileName);

    const audioUrl = urlData.publicUrl;

    // Update voiceover with audio URL and actual timing
    const { error: updateError } = await supabase
      .from("story_voiceovers")
      .update({
        audio_url: audioUrl,
        ssml_content: ssmlContent,
        actual_timing: actualTiming,
        total_duration_ms: totalDurationMs,
        status: "done",
      })
      .eq("id", voiceover.id);

    if (updateError) {
      throw new Error(`Failed to update voiceover: ${updateError.message}`);
    }

    console.log(`[generate-voiceover] Complete: ${audioUrl}, duration: ${totalDurationMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        voiceover_id: voiceover.id,
        audio_url: audioUrl,
        total_duration_ms: totalDurationMs,
        actual_timing: actualTiming,
        has_word_timestamps: alignment !== undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[generate-voiceover] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
