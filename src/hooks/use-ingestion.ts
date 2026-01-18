import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type IngestionJob = Tables<"ingestion_jobs">;

export function useIngestionJobs(coursePackId?: string) {
  return useQuery({
    queryKey: ["ingestion-jobs", coursePackId],
    queryFn: async () => {
      let query = supabase
        .from("ingestion_jobs")
        .select("*, course_packs(title)")
        .order("created_at", { ascending: false });
      
      if (coursePackId) {
        query = query.eq("course_pack_id", coursePackId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (IngestionJob & { course_packs: { title: string } | null })[];
    },
  });
}

export function useCreateIngestionJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      coursePackId,
      file,
    }: {
      coursePackId: string;
      file: File;
    }) => {
      // Generate unique file path
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${coursePackId}/${timestamp}_${sanitizedName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create ingestion job record
      const { data: job, error: jobError } = await supabase
        .from("ingestion_jobs")
        .insert({
          course_pack_id: coursePackId,
          file_path: filePath,
          file_name: file.name,
          status: "pending",
          created_by: user?.id,
        })
        .select()
        .single();

      if (jobError) {
        // Clean up uploaded file if job creation fails
        await supabase.storage.from("exam-pdfs").remove([filePath]);
        throw new Error(`Failed to create job: ${jobError.message}`);
      }

      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
    },
  });
}

export function useProcessJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase.functions.invoke("process-exam-pdf", {
        body: { jobId },
      });

      if (error) {
        throw new Error(`Processing failed: ${error.message}`);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (job: IngestionJob) => {
      // Delete file from storage
      await supabase.storage.from("exam-pdfs").remove([job.file_path]);

      // Delete job record
      const { error } = await supabase
        .from("ingestion_jobs")
        .delete()
        .eq("id", job.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
    },
  });
}
