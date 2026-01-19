import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessImageRequest {
  imageUrl: string;
  questionId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables not configured");
    }

    const { imageUrl, questionId }: ProcessImageRequest = await req.json();
    console.log(`Processing image for question ${questionId}: ${imageUrl}`);

    if (!imageUrl || !questionId) {
      throw new Error("imageUrl and questionId are required");
    }

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageArrayBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow
    let base64Image = '';
    const chunkSize = 32768;
    for (let i = 0; i < imageBytes.length; i += chunkSize) {
      const chunk = imageBytes.slice(i, i + chunkSize);
      base64Image += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64Image = btoa(base64Image);

    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    console.log(`Image fetched: ${imageBytes.length} bytes, type: ${contentType}`);

    // Use Gemini to process the image and extract the line drawing
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: contentType,
                data: base64Image
              }
            },
            {
              text: `Analyze this mathematical or scientific diagram image. 

Your task is to extract just the essential line drawing/diagram elements (graphs, axes, labels, equations, geometric shapes, etc.) and remove any background.

Return a description of what you see in the image, including:
1. Type of diagram (graph, geometric figure, circuit, etc.)
2. Key elements (axes, curves, points, labels)
3. Any text or equations visible
4. Colors used for different elements

This description will help verify the image content.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000
      }
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No description available';
    console.log(`Image description: ${description.substring(0, 200)}...`);

    // For now, we'll return the original image URL since true background removal
    // requires more sophisticated image processing (like rembg or similar).
    // The CSS dark:invert will handle the dark mode adaptation for line drawings.
    
    // In a future iteration, we could:
    // 1. Use a dedicated background removal API (remove.bg, rembg)
    // 2. Use Gemini's image generation to redraw the diagram
    // 3. Use canvas-based thresholding for simple white backgrounds

    return new Response(
      JSON.stringify({ 
        success: true,
        processedUrl: imageUrl, // For now, keep original
        description,
        message: "Image analyzed. CSS filters will be applied for dark mode adaptation."
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
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
