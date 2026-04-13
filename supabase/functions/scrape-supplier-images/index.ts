/**
 * scrape-supplier-images: Scrape product images from a pinned supplier URL
 * 
 * Uses Firecrawl to extract images from the specific listing page,
 * saves them as product_images with source = "pinned_supplier".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { product_id, supplier_url } = await req.json();
    if (!product_id || !supplier_url) {
      return new Response(
        JSON.stringify({ error: "product_id and supplier_url required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scrape-supplier-images] Scraping: ${supplier_url}`);

    // Strategy 1: Firecrawl (best for JS-heavy sites like AliExpress)
    let imageUrls: string[] = [];
    
    if (firecrawlKey) {
      try {
        const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: supplier_url,
            formats: ["html"],
            waitFor: 3000,
          }),
        });

        if (fcResp.ok) {
          const fcData = await fcResp.json();
          const html = fcData.data?.html || "";

          // Extract image URLs from HTML
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let match;
          while ((match = imgRegex.exec(html)) !== null) {
            const src = match[1];
            if (isProductImage(src)) {
              imageUrls.push(src);
            }
          }

          // Also extract from og:image and other meta tags
          const ogRegex = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
          while ((match = ogRegex.exec(html)) !== null) {
            if (match[1] && !imageUrls.includes(match[1])) {
              imageUrls.push(match[1]);
            }
          }

          // Extract from data-src (lazy loaded images common on AliExpress)
          const dataSrcRegex = /data-src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
          while ((match = dataSrcRegex.exec(html)) !== null) {
            if (isProductImage(match[1]) && !imageUrls.includes(match[1])) {
              imageUrls.push(match[1]);
            }
          }

          console.log(`[scrape-supplier-images] Firecrawl found ${imageUrls.length} images`);
        }
      } catch (e) {
        console.warn("[scrape-supplier-images] Firecrawl error:", e);
      }
    }

    // Strategy 2: Native fetch fallback
    if (imageUrls.length === 0) {
      try {
        const resp = await fetch(supplier_url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (resp.ok) {
          const html = await resp.text();
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let match;
          while ((match = imgRegex.exec(html)) !== null) {
            if (isProductImage(match[1])) {
              imageUrls.push(match[1]);
            }
          }
        }
      } catch (e) {
        console.warn("[scrape-supplier-images] Native fetch error:", e);
      }
    }

    // Deduplicate and limit
    imageUrls = [...new Set(imageUrls)].slice(0, 8);

    if (imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, images_found: 0, message: "No product images found on supplier page" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove existing pinned_supplier images for this product (replace with fresh scrape)
    await supabase.from("product_images")
      .delete()
      .eq("product_id", product_id)
      .eq("source", "pinned_supplier");

    // Insert new images
    const rows = imageUrls.map((url, i) => ({
      product_id,
      url,
      source: "pinned_supplier",
      label: i === 0 ? "hero" : `detail_${i}`,
      is_primary: i === 0,
      verified: true,  // Auto-verified since operator chose this listing
      manually_approved: true,
    }));

    const { error: insertErr } = await supabase.from("product_images").insert(rows);
    if (insertErr) {
      console.error("[scrape-supplier-images] Insert error:", insertErr);
      throw insertErr;
    }

    // Update product image_url to the first supplier image
    await supabase.from("products").update({
      image_url: imageUrls[0],
    }).eq("id", product_id);

    console.log(`[scrape-supplier-images] Saved ${rows.length} pinned_supplier images`);

    return new Response(
      JSON.stringify({ success: true, images_found: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[scrape-supplier-images] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** Filter out non-product images (icons, logos, banners, tracking pixels) */
function isProductImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  const u = url.toLowerCase();
  
  // Exclude tiny images, tracking pixels, icons
  if (u.includes("1x1") || u.includes("pixel") || u.includes("tracking")) return false;
  if (u.includes("/icon") || u.includes("favicon") || u.includes("logo")) return false;
  if (u.includes("sprite") || u.includes("placeholder") || u.includes("loading")) return false;
  if (u.includes("avatar") || u.includes("banner") || u.includes("ad_")) return false;
  if (u.includes(".svg") || u.includes(".gif")) return false;
  
  // Must be a real image format
  if (!u.match(/\.(jpg|jpeg|png|webp)/i) && !u.includes("image")) return false;
  
  // Prefer larger images (AliExpress pattern: _120x120 vs _960x960)
  const sizeMatch = u.match(/_(\d+)x(\d+)/);
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1]);
    if (w < 200) return false;
  }
  
  return true;
}
