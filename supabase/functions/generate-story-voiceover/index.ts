/**
 * Generate Story Voiceover
 * 
 * Takes a compiled script and generates voiceover audio via ElevenLabs.
 * Uses the /with-timestamps endpoint for word-level timing.
 * 
 * CRITICAL: This function uses compiled_script (canonical_text) exactly as stored.
 * The char spans in scene_segments are computed against this exact text.
 * 
 * Input: voiceover_id (from compile-story-script)
 * Output: audio_url with actual_timing including word-level timestamps (char spans)
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
  char_start: number;
  char_end: number;
  start_ms: number;
  end_ms: number;
}

interface ActualTiming {
  scene_index: number;
  start_ms: number;
  end_ms: number;
  words: WordTiming[];
}

// Alignment mismatch threshold - if alignment differs by more than this %, fall back
const ALIGNMENT_MISMATCH_THRESHOLD = 0.1; // 10%

// Minimum canonical length for alignment to be meaningful
const MIN_CANONICAL_LENGTH = 20;

// Minimum character similarity for prefix/suffix check
const MIN_CHAR_SIMILARITY = 0.8; // 80%

interface AlignmentDebug {
  canonical_length: number;
  alignment_length: number;
  mismatch_pct: number;
  alignment_ok: boolean;
  separator: string;
  prefix_match?: boolean;
  suffix_match?: boolean;
  fallback_reason?: string;
}

/**
 * Normalize text for comparison: collapse whitespace, normalize quotes/dashes
 */
function normalizeForComparison(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // Smart quotes to straight
    .replace(/[\u2013\u2014]/g, "-")              // Em/en dashes to hyphen
    .replace(/\s+/g, " ")                          // Collapse whitespace
    .replace(/\.\.\./g, "…")                       // Normalize ellipsis
    .trim();
}

/**
 * Check if two strings have similar characters at prefix/suffix
 */
function checkPrefixSuffixSimilarity(a: string, b: string, checkLen: number = 100): { prefixMatch: boolean; suffixMatch: boolean } {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);
  
  // Check prefix
  const prefixA = normalizedA.slice(0, Math.min(checkLen, normalizedA.length));
  const prefixB = normalizedB.slice(0, Math.min(checkLen, normalizedB.length));
  const minPrefixLen = Math.min(prefixA.length, prefixB.length);
  let prefixMatches = 0;
  for (let i = 0; i < minPrefixLen; i++) {
    if (prefixA[i] === prefixB[i]) prefixMatches++;
  }
  const prefixMatch = minPrefixLen > 0 && (prefixMatches / minPrefixLen) >= MIN_CHAR_SIMILARITY;
  
  // Check suffix
  const suffixA = normalizedA.slice(-Math.min(checkLen, normalizedA.length));
  const suffixB = normalizedB.slice(-Math.min(checkLen, normalizedB.length));
  const minSuffixLen = Math.min(suffixA.length, suffixB.length);
  let suffixMatches = 0;
  for (let i = 0; i < minSuffixLen; i++) {
    if (suffixA[suffixA.length - 1 - i] === suffixB[suffixB.length - 1 - i]) suffixMatches++;
  }
  const suffixMatch = minSuffixLen > 0 && (suffixMatches / minSuffixLen) >= MIN_CHAR_SIMILARITY;
  
  return { prefixMatch, suffixMatch };
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

    // Fetch voiceover record - use explicit FK name to avoid ambiguity
    // (story_jobs has both story_voiceovers.story_job_id and story_jobs.active_voiceover_id)
    const { data: voiceover, error: voiceoverError } = await supabase
      .from("story_voiceovers")
      .select("*, story_jobs!story_voiceovers_story_job_id_fkey(story_type, title)")
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
    
    // Use compiled_script as the canonical text - this is what char offsets are computed against
    const canonicalText = voiceover.compiled_script as string;

    console.log(`[generate-voiceover] Generating for voiceover ${voiceover.id}`);
    console.log(`[generate-voiceover] Voice: ${voiceId}, Canonical text length: ${canonicalText.length} chars`);

    // Call ElevenLabs TTS with timestamps
    // Using plain text (not SSML) to ensure alignment works correctly
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: canonicalText, // Use the exact canonical text
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

    // Extract character-level alignment
    const alignment = ttsData.alignment as {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    } | undefined;

    // Build actual timing with word-level char spans
    let actualTiming: ActualTiming[] = [];
    let totalDurationMs = 0;
    let alignmentOk = false;
    
    // Debug info for diagnosing alignment issues
    const alignmentDebug: AlignmentDebug = {
      canonical_length: canonicalText.length,
      alignment_length: alignment?.characters?.length || 0,
      mismatch_pct: 0,
      alignment_ok: false,
      separator: " ... ",
    };

    if (alignment && alignment.characters.length > 0) {
      const alignLen = alignment.characters.length;
      const canonLen = canonicalText.length;
      
      // Guard against tiny/empty canonical text (avoid divide-by-zero)
      if (canonLen < MIN_CANONICAL_LENGTH) {
        console.warn(`[generate-voiceover] Canonical text too short (${canonLen} chars), falling back to predicted timing`);
        alignmentDebug.fallback_reason = `canonical_too_short_${canonLen}`;
        alignmentOk = false;
      } else {
        const mismatchPct = Math.abs(alignLen - canonLen) / canonLen;
        alignmentDebug.mismatch_pct = Math.round(mismatchPct * 100);
        
        console.log(`[generate-voiceover] Alignment: ${alignLen} chars vs canonical ${canonLen} chars (mismatch: ${(mismatchPct * 100).toFixed(1)}%)`);
        
        // Check 1: Length mismatch threshold
        if (mismatchPct > ALIGNMENT_MISMATCH_THRESHOLD) {
          console.warn(`[generate-voiceover] Alignment mismatch too high (${(mismatchPct * 100).toFixed(1)}% > ${ALIGNMENT_MISMATCH_THRESHOLD * 100}%), falling back to predicted timing`);
          alignmentDebug.fallback_reason = `length_mismatch_${alignmentDebug.mismatch_pct}pct`;
          alignmentOk = false;
        } else {
          // Check 2: Unicode normalization - verify prefix/suffix character similarity
          const alignedText = alignment.characters.join("");
          const { prefixMatch, suffixMatch } = checkPrefixSuffixSimilarity(canonicalText, alignedText);
          alignmentDebug.prefix_match = prefixMatch;
          alignmentDebug.suffix_match = suffixMatch;
          
          if (!prefixMatch || !suffixMatch) {
            console.warn(`[generate-voiceover] Character drift detected (prefix: ${prefixMatch}, suffix: ${suffixMatch}), falling back to predicted timing`);
            alignmentDebug.fallback_reason = `char_drift_p${prefixMatch ? 1 : 0}_s${suffixMatch ? 1 : 0}`;
            alignmentOk = false;
          } else {
            alignmentOk = true;
            alignmentDebug.alignment_ok = true;
          }
        }
      }
      
      // Only process word timing if alignment passed all checks
      if (alignmentOk) {
        // For each scene segment, find words and their timing based on char positions
        for (const segment of sceneSegments) {
          const segmentWords: WordTiming[] = [];
          let segmentStartMs = Infinity;
          let segmentEndMs = 0;
          
          // Parse words from the segment text with their positions
          const text = segment.text;
          const wordRegex = /\S+/g;
          let match: RegExpExecArray | null;
          
          while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            // Calculate absolute char positions in canonical text
            const wordCharStart = segment.char_start + match.index;
            const wordCharEnd = wordCharStart + word.length;
            
            // Get timing from alignment using char positions
            // Ensure indices are within bounds
            const alignStartIdx = Math.min(wordCharStart, alignment.character_start_times_seconds.length - 1);
            const alignEndIdx = Math.min(wordCharEnd - 1, alignment.character_end_times_seconds.length - 1);
            
            if (alignStartIdx >= 0 && alignEndIdx >= 0 && alignStartIdx < alignment.character_start_times_seconds.length) {
              const wordStartMs = Math.floor(alignment.character_start_times_seconds[alignStartIdx] * 1000);
              const wordEndMs = Math.floor(alignment.character_end_times_seconds[alignEndIdx] * 1000);
              
              segmentWords.push({
                word,
                char_start: wordCharStart,
                char_end: wordCharEnd,
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
      }
    }
    
    // Fallback to predicted timing if alignment failed or wasn't usable
    if (!alignmentOk) {
      console.log(`[generate-voiceover] Using predicted timing (no word-level alignment)`);
      const predictedTiming = voiceover.predicted_timing as Array<{
        scene_index: number;
        start_ms: number;
        end_ms: number;
      }>;
      
      actualTiming = predictedTiming.map(t => ({
        scene_index: t.scene_index,
        start_ms: t.start_ms,
        end_ms: t.end_ms,
        words: [], // No word-level timing available
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

    // Update voiceover with audio URL, timing, and alignment debug info (persisted for diagnostics)
    const { error: updateError } = await supabase
      .from("story_voiceovers")
      .update({
        audio_url: audioUrl,
        actual_timing: actualTiming,
        total_duration_ms: totalDurationMs,
        status: "done",
        // Persist alignment debug for diagnostics (UI can show "Word sync unavailable" if false)
        has_word_timestamps: alignmentOk,
        alignment_ok: alignmentOk,
        alignment_debug: alignmentDebug,
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
        has_word_timestamps: alignmentOk,
        alignment_debug: alignmentDebug,
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
