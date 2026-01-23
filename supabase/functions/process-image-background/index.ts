import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessImageRequest {
  imageUrl: string;
  outputPath: string; // e.g. "subparts/question123_a_processed.png"
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user is admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageUrl, outputPath }: ProcessImageRequest = await req.json();
    console.log(`Processing image: ${imageUrl} -> ${outputPath}`);

    if (!imageUrl || !outputPath) {
      throw new Error("imageUrl and outputPath are required");
    }

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageArrayBuffer);
    console.log(`Image fetched: ${imageBytes.length} bytes`);

    // Decode the image using imagescript
    const image = await Image.decode(imageBytes);
    console.log(`Image decoded: ${image.width}x${image.height}`);

    // White/light background removal algorithm
    const WHITE_THRESHOLD = 240;
    const LIGHTNESS_THRESHOLD = 0.92;
    
    // Process each pixel
    for (let y = 1; y <= image.height; y++) {
      for (let x = 1; x <= image.width; x++) {
        const pixel = image.getPixelAt(x, y);
        
        // Extract RGBA components (pixel is a 32-bit integer: 0xRRGGBBAA)
        const r = (pixel >> 24) & 0xFF;
        const g = (pixel >> 16) & 0xFF;
        const b = (pixel >> 8) & 0xFF;
        const a = pixel & 0xFF;
        
        // Skip already transparent pixels
        if (a < 10) continue;
        
        // Check if pixel is white or near-white
        const isWhite = r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
        
        // Also check lightness for off-white/cream colors
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const lightness = (max + min) / 2;
        const isVeryLight = lightness >= LIGHTNESS_THRESHOLD && Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20;
        
        if (isWhite || isVeryLight) {
          const whiteness = Math.min(r, g, b) / 255;
          if (whiteness > 0.9) {
            // Fully transparent for very white pixels
            image.setPixelAt(x, y, (r << 24) | (g << 16) | (b << 8) | 0);
          } else {
            // Gradual transparency for slightly off-white
            const newAlpha = Math.floor((1 - whiteness) * 255 * 2);
            image.setPixelAt(x, y, (r << 24) | (g << 16) | (b << 8) | Math.min(255, newAlpha));
          }
        }
      }
    }

    console.log("Background removal complete");

    // Encode back to PNG with transparency
    const processedBytes = await image.encode();
    console.log(`Processed image: ${processedBytes.length} bytes`);

    // Upload the processed image to storage
    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(outputPath, processedBytes, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload processed image: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(outputPath);

    console.log(`Processed image uploaded: ${publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processedUrl: publicUrl,
        message: "Image processed - white background removed"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error processing image:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});