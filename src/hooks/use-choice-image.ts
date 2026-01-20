import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for uploading and processing choice images.
 * Uploads to storage, runs background removal, returns processed URL.
 */
export function useUploadChoiceImage() {
  return useMutation({
    mutationFn: async ({ choiceId, file }: { choiceId: string; file: File }): Promise<string> => {
      const fileExt = file.name.split('.').pop();
      const fileName = `choice-${choiceId}-${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('question-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(fileName);

      // Process the image to remove background
      try {
        const { data: processData, error: processError } = await supabase.functions.invoke(
          'process-choice-image',
          {
            body: { imageUrl: publicUrl, choiceId }
          }
        );

        if (processError) {
          console.error('Choice image processing error:', processError);
          return publicUrl;
        }

        if (processData?.processedUrl) {
          console.log('Choice image processed, new URL:', processData.processedUrl);
          return processData.processedUrl;
        }
      } catch (err) {
        console.error('Failed to process choice image:', err);
      }

      return publicUrl;
    },
  });
}
