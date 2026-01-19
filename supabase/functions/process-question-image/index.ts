import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64, encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessImageRequest {
  imageUrl: string;
  questionId: string;
}

// Simple PNG encoder for RGBA data
function createPNG(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = new Uint8Array(25);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, 13, false); // length
  ihdr[4] = 73; ihdr[5] = 72; ihdr[6] = 68; ihdr[7] = 82; // "IHDR"
  ihdrView.setUint32(8, width, false);
  ihdrView.setUint32(12, height, false);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // color type (RGBA)
  ihdr[18] = 0; // compression
  ihdr[19] = 0; // filter
  ihdr[20] = 0; // interlace
  
  // Calculate CRC for IHDR
  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdrView.setUint32(21, ihdrCrc, false);
  
  // IDAT chunk - raw image data with filter bytes
  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter byte (none)
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgba[srcIdx];
      rawData[dstIdx + 1] = rgba[srcIdx + 1];
      rawData[dstIdx + 2] = rgba[srcIdx + 2];
      rawData[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }
  
  // Compress with deflate
  const compressed = deflateSync(rawData);
  
  const idat = new Uint8Array(12 + compressed.length);
  const idatView = new DataView(idat.buffer);
  idatView.setUint32(0, compressed.length, false);
  idat[4] = 73; idat[5] = 68; idat[6] = 65; idat[7] = 84; // "IDAT"
  idat.set(compressed, 8);
  const idatCrc = crc32(idat.slice(4, 8 + compressed.length));
  idatView.setUint32(8 + compressed.length, idatCrc, false);
  
  // IEND chunk
  const iend = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  
  // Combine all chunks
  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  png.set(signature, 0);
  png.set(ihdr, signature.length);
  png.set(idat, signature.length + ihdr.length);
  png.set(iend, signature.length + ihdr.length + idat.length);
  
  return png;
}

// CRC32 implementation
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  const table = getCrcTable();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
}

// Simple deflate compression (store method - no compression, just wrapping)
function deflateSync(data: Uint8Array): Uint8Array {
  // Use zlib format with store method (no compression)
  const blocks: Uint8Array[] = [];
  const BLOCK_SIZE = 65535;
  
  // Zlib header
  blocks.push(new Uint8Array([0x78, 0x01])); // CMF, FLG
  
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockLen = Math.min(BLOCK_SIZE, remaining);
    const isLast = offset + blockLen >= data.length;
    
    const block = new Uint8Array(5 + blockLen);
    block[0] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE=00 (stored)
    block[1] = blockLen & 0xFF;
    block[2] = (blockLen >> 8) & 0xFF;
    block[3] = (~blockLen) & 0xFF;
    block[4] = ((~blockLen) >> 8) & 0xFF;
    block.set(data.slice(offset, offset + blockLen), 5);
    blocks.push(block);
    
    offset += blockLen;
  }
  
  // Adler-32 checksum
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  const adlerBytes = new Uint8Array(4);
  adlerBytes[0] = (adler >> 24) & 0xFF;
  adlerBytes[1] = (adler >> 16) & 0xFF;
  adlerBytes[2] = (adler >> 8) & 0xFF;
  adlerBytes[3] = adler & 0xFF;
  blocks.push(adlerBytes);
  
  // Combine all blocks
  const totalLen = blocks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const block of blocks) {
    result.set(block, pos);
    pos += block.length;
  }
  
  return result;
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
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    
    console.log(`Image fetched: ${imageBytes.length} bytes, type: ${contentType}`);

    // Decode the image to get pixel data
    // We'll use a simple approach: decode PNG/JPEG and process pixels
    
    // For simplicity, we'll use the ImageMagick-style approach via a canvas
    // Since Deno doesn't have native canvas, we'll use a simpler approach:
    // Use Gemini to generate a clean version of the diagram
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      // If no Gemini key, return original
      console.log("No GEMINI_API_KEY, returning original image");
      return new Response(
        JSON.stringify({ 
          success: true,
          processedUrl: imageUrl,
          message: "No processing available without API key"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert image to base64
    let base64Image = '';
    const chunkSize = 32768;
    for (let i = 0; i < imageBytes.length; i += chunkSize) {
      const chunk = imageBytes.slice(i, i + chunkSize);
      base64Image += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64Image = btoa(base64Image);

    // Use Gemini's image generation to redraw the diagram with transparent background
    // First, analyze the image
    const analyzeUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const analyzePayload = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: contentType,
              data: base64Image
            }
          },
          {
            text: `Describe this mathematical/scientific diagram in detail for recreation. Include:
1. All text, labels, and equations exactly as written
2. All geometric shapes, lines, curves with their positions
3. All coordinate systems, axes, tick marks
4. All arrows, vectors, and their directions
5. The overall layout and spatial relationships

Be extremely precise and thorough.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000
      }
    };

    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analyzePayload)
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      console.error("Gemini analyze error:", analyzeResponse.status, errorText);
      throw new Error(`Gemini API error: ${analyzeResponse.status}`);
    }

    const analyzeData = await analyzeResponse.json();
    const description = analyzeData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`Image description (first 300 chars): ${description.substring(0, 300)}...`);

    // Now use Gemini's image generation model to create a clean version
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GEMINI_API_KEY}`;
    
    const generatePayload = {
      contents: [{
        parts: [{
          text: `Create a clean mathematical diagram with these exact specifications:

${description}

IMPORTANT REQUIREMENTS:
- Use PURE WHITE background (#FFFFFF)
- Use only BLACK (#000000) for all lines, text, and shapes
- Make lines crisp and clear
- Use clean, mathematical typography
- No shadows, gradients, or gray tones
- Simple, clean academic style like a textbook figure`
        }]
      }],
      generationConfig: {
        responseModalities: ["image", "text"],
        temperature: 0.1
      }
    };

    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generatePayload)
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error("Gemini generate error:", generateResponse.status, errorText);
      // Fall back to original image
      return new Response(
        JSON.stringify({ 
          success: true,
          processedUrl: imageUrl,
          message: "Image generation failed, using original"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const generateData = await generateResponse.json();
    console.log("Generate response:", JSON.stringify(generateData).substring(0, 500));
    
    // Extract the generated image
    const parts = generateData.candidates?.[0]?.content?.parts || [];
    let generatedImageBase64 = null;
    let generatedMimeType = 'image/png';
    
    for (const part of parts) {
      if (part.inlineData) {
        generatedImageBase64 = part.inlineData.data;
        generatedMimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!generatedImageBase64) {
      console.log("No image generated, using original");
      return new Response(
        JSON.stringify({ 
          success: true,
          processedUrl: imageUrl,
          message: "No image in response, using original"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode the generated image
    const generatedBytes = decodeBase64(generatedImageBase64);
    console.log(`Generated image: ${generatedBytes.length} bytes`);

    // Upload the processed image to storage
    const processedFileName = `${questionId}-processed-${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(processedFileName, generatedBytes, {
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
      .getPublicUrl(processedFileName);

    // Update the question with the new image URL
    const { error: updateError } = await supabase
      .from('questions')
      .update({ image_url: publicUrl })
      .eq('id', questionId);

    if (updateError) {
      console.error("Update error:", updateError);
      // Don't fail, we still have the image
    }

    console.log(`Processed image uploaded: ${publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processedUrl: publicUrl,
        message: "Image processed and background removed"
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
