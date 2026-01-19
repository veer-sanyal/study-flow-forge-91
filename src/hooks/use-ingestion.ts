import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type IngestionJob = Tables<"ingestion_jobs">;

export type IngestionKind = "pdf" | "calendar";

export function useIngestionJobs(coursePackId?: string, kind?: IngestionKind) {
  return useQuery({
    queryKey: ["ingestion-jobs", coursePackId, kind],
    queryFn: async () => {
      let query = supabase
        .from("ingestion_jobs")
        .select("*, course_packs(title)")
        .order("created_at", { ascending: false });
      
      if (coursePackId) {
        query = query.eq("course_pack_id", coursePackId);
      }
      
      if (kind) {
        query = query.eq("kind", kind);
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
      kind = "pdf",
    }: {
      coursePackId: string;
      file: File;
      kind?: IngestionKind;
    }) => {
      // Determine storage bucket based on kind
      const bucket = kind === "calendar" ? "calendar-images" : "exam-pdfs";
      
      // Generate unique file path
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${coursePackId}/${timestamp}_${sanitizedName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
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
          kind,
        })
        .select()
        .single();

      if (jobError) {
        // Clean up uploaded file if job creation fails
        await supabase.storage.from(bucket).remove([filePath]);
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
    mutationFn: async ({ jobId, kind = "pdf" }: { jobId: string; kind?: IngestionKind }) => {
      const functionName = kind === "calendar" ? "process-calendar-image" : "process-exam-pdf";
      
      const { data, error } = await supabase.functions.invoke(functionName, {
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
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (job: IngestionJob) => {
      // Determine storage bucket based on kind
      const kind = (job as any).kind as IngestionKind;
      const bucket = kind === "calendar" ? "calendar-images" : "exam-pdfs";
      
      // Delete file from storage
      await supabase.storage.from(bucket).remove([job.file_path]);

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

// Calendar events hooks
export function useCalendarEvents(coursePackId?: string) {
  return useQuery({
    queryKey: ["calendar-events", coursePackId],
    queryFn: async () => {
      let query = supabase
        .from("calendar_events")
        .select("*")
        .order("week_number", { ascending: true })
        .order("event_date", { ascending: true });
      
      if (coursePackId) {
        query = query.eq("course_pack_id", coursePackId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!coursePackId,
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      ...updates 
    }: { 
      id: string; 
      needs_review?: boolean;
      title?: string;
      description?: string;
      week_number?: number;
      event_type?: string;
      event_date?: string | null;
    }) => {
      const { error } = await supabase
        .from("calendar_events")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

// Generate topics from calendar events
export function useGenerateTopicsFromEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (coursePackId: string) => {
      // Fetch all calendar events for this course pack - only topic events
      const { data: events, error: eventsError } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("course_pack_id", coursePackId)
        .eq("event_type", "topic") // Only topic events become topics
        .order("week_number", { ascending: true })
        .order("event_date", { ascending: true });

      if (eventsError) throw eventsError;

      // Fetch existing topics to avoid duplicates
      const { data: existingTopics, error: topicsError } = await supabase
        .from("topics")
        .select("title")
        .eq("course_pack_id", coursePackId);

      if (topicsError) throw topicsError;

      const existingTitles = new Set(existingTopics?.map(t => t.title.toLowerCase()) || []);

      // Extract unique topics from events
      const topicsToCreate: { 
        title: string; 
        description: string; 
        scheduled_week: number;
        event_date: string | null;
      }[] = [];
      const seenTitles = new Set<string>();

      for (const event of events || []) {
        const normalizedTitle = event.title.trim();
        const lowerTitle = normalizedTitle.toLowerCase();
        
        // Skip if already exists or we've seen it
        if (existingTitles.has(lowerTitle) || seenTitles.has(lowerTitle)) {
          continue;
        }

        seenTitles.add(lowerTitle);
        topicsToCreate.push({
          title: normalizedTitle,
          description: event.description || "",
          scheduled_week: event.week_number,
          event_date: event.event_date,
        });
      }

      if (topicsToCreate.length === 0) {
        return { created: 0, message: "No new topics to create" };
      }

      // Insert topics
      const { error: insertError } = await supabase
        .from("topics")
        .insert(topicsToCreate.map(t => ({
          course_pack_id: coursePackId,
          title: t.title,
          description: t.description || null,
          scheduled_week: t.scheduled_week,
        })));

      if (insertError) throw insertError;

      return { created: topicsToCreate.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}