import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatExamType } from "@/lib/examUtils";

type IngestionJob = Tables<"ingestion_jobs">;

export type IngestionKind = "pdf" | "calendar";

export function useIngestionJobs(coursePackId?: string, kind?: IngestionKind) {
  const queryClient = useQueryClient();

  // Subscribe to realtime updates for ingestion jobs
  useEffect(() => {
    const channel = supabase
      .channel("ingestion-jobs-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ingestion_jobs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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

// Hook for tracking active ingestion job progress
export function useIngestionProgress() {
  const queryClient = useQueryClient();
  const [activeJob, setActiveJob] = useState<IngestionJob | null>(null);

  // Fetch active (processing) ingestion jobs
  const { data: processingJobs } = useQuery({
    queryKey: ["ingestion-jobs-processing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*, course_packs(title)")
        .eq("status", "processing")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as (IngestionJob & { course_packs: { title: string } | null })[];
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("ingestion-progress")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ingestion_jobs",
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["ingestion-jobs-processing"] });
          queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
          
          if (payload.new && (payload.new as any).status === "processing") {
            setActiveJob(payload.new as IngestionJob);
          } else if (payload.new && ["completed", "failed"].includes((payload.new as any).status)) {
            if (activeJob?.id === (payload.new as any).id) {
              setActiveJob(payload.new as IngestionJob);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, activeJob]);

  // Update active job from fetched data
  useEffect(() => {
    if (processingJobs && processingJobs.length > 0) {
      setActiveJob(processingJobs[0]);
    }
  }, [processingJobs]);

  return {
    activeJob,
    isProcessing: activeJob?.status === "processing",
    processingJobs: processingJobs || [],
  };
}

export function useCreateIngestionJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      coursePackId,
      file,
      kind = "pdf",
      answerKeyFile,
    }: {
      coursePackId: string;
      file: File;
      kind?: IngestionKind;
      answerKeyFile?: File;
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

      // Upload answer key if provided
      let answerKeyPath: string | null = null;
      let answerKeyFileName: string | null = null;
      
      if (answerKeyFile) {
        const sanitizedAnswerKeyName = answerKeyFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        answerKeyPath = `${coursePackId}/${timestamp}_answerkey_${sanitizedAnswerKeyName}`;
        
        const { error: answerKeyUploadError } = await supabase.storage
          .from(bucket)
          .upload(answerKeyPath, answerKeyFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (answerKeyUploadError) {
          // Clean up exam file and throw error
          await supabase.storage.from(bucket).remove([filePath]);
          throw new Error(`Failed to upload answer key: ${answerKeyUploadError.message}`);
        }
        
        answerKeyFileName = answerKeyFile.name;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create ingestion job record with answer key info
      const { data: job, error: jobError } = await supabase
        .from("ingestion_jobs")
        .insert({
          course_pack_id: coursePackId,
          file_path: filePath,
          file_name: file.name,
          status: "pending",
          created_by: user?.id,
          kind,
          answer_key_path: answerKeyPath,
          answer_key_file_name: answerKeyFileName,
          has_answer_key: !!answerKeyFile,
        } as any)
        .select()
        .single();

      if (jobError) {
        // Clean up uploaded files if job creation fails
        await supabase.storage.from(bucket).remove([filePath]);
        if (answerKeyPath) {
          await supabase.storage.from(bucket).remove([answerKeyPath]);
        }
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

export function usePublishExam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, isPublished }: { jobId: string; isPublished: boolean }) => {
      // Cast to any to handle new column before types are regenerated
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ is_published: isPublished } as any)
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-job"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-job-for-exam"] });
    },
  });
}

export function usePublishCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, isPublished }: { courseId: string; isPublished: boolean }) => {
      // Cast to any to handle new column before types are regenerated
      const { error } = await supabase
        .from("course_packs")
        .update({ is_published: isPublished } as any)
        .eq("id", courseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["course_packs"] });
    },
  });
}

export interface UpdateExamDetailsParams {
  jobId: string;
  examYear?: number | null;
  examSemester?: string | null;
  examType?: string | null;
  coursePackId?: string;
}

export function useUpdateExamDetails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, examYear, examSemester, examType, coursePackId }: UpdateExamDetailsParams) => {
      // Determine is_final from simple exam type (f = final)
      const isFinal = examType === "f";
      
      // Update job details
      const { error: jobError } = await supabase
        .from("ingestion_jobs")
        .update({
          exam_year: examYear,
          exam_semester: examSemester,
          exam_type: examType,
          is_final: isFinal,
          ...(coursePackId && { course_pack_id: coursePackId }),
        } as any)
        .eq("id", jobId);

      if (jobError) throw jobError;

      // Build new source_exam string for questions using display format
      const parts: string[] = [];
      if (examSemester && examYear) {
        parts.push(`${examSemester} ${examYear}`);
      }
      const formattedType = formatExamType(examType);
      if (formattedType) {
        parts.push(formattedType);
      }
      const newSourceExam = parts.join(" ") || "Unknown Exam";

      // Get current job's course_pack_id and old source_exam to find related questions
      const { data: currentJob } = await supabase
        .from("ingestion_jobs")
        .select("course_pack_id")
        .eq("id", jobId)
        .single();

      if (currentJob) {
        // Extract midterm number from simple exam type for non-finals
        let midtermNumber: number | null = null;
        if (!isFinal && examType) {
          const numVal = parseInt(examType, 10);
          if (!isNaN(numVal) && numVal >= 1 && numVal <= 3) {
            midtermNumber = numVal;
          }
        }

        // Get all questions for this course pack and update their source_exam
        // We update all questions since there's no direct job_id on questions
        // In a real app you might track which questions came from which job
        const { data: questions } = await supabase
          .from("questions")
          .select("id")
          .eq("course_pack_id", currentJob.course_pack_id);

        if (questions && questions.length > 0) {
          // Update source_exam and midterm_number for all questions in this course pack
          const updateData: { source_exam: string; midterm_number?: number | null } = { 
            source_exam: newSourceExam 
          };
          
          // For non-final exams, also update midterm_number
          if (!isFinal && midtermNumber !== null) {
            updateData.midterm_number = midtermNumber;
          }
          
          await supabase
            .from("questions")
            .update(updateData)
            .eq("course_pack_id", currentJob.course_pack_id);
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-job"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["questions-for-review"] });
    },
  });
}

export function useIngestionJob(jobId: string) {
  return useQuery({
    queryKey: ["ingestion-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*, course_packs(id, title)")
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data as IngestionJob & { course_packs: { id: string; title: string } | null };
    },
    enabled: !!jobId,
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

// Helper to extract section number from topic title (e.g., "8.3: Topic Name" -> "8.3")
function extractSectionNumber(title: string): string | null {
  const match = title.match(/^(\d+(?:\.\d+)?)\s*:/);
  return match ? match[1] : null;
}

// Helper to extract base topic name, removing suffixes like "I", "II", "Part 1", etc.
function extractBaseTopicName(title: string): string {
  // Remove common multi-day suffixes: I, II, III, IV, V, Part 1, Part 2, Day 1, Day 2, (continued), etc.
  return title
    .replace(/\s*-\s*Part\s*\d+\s*$/i, '')        // - Part 1, - Part 2 (from our extraction)
    .replace(/\s+(I{1,3}|IV|V|VI{0,3})\s*$/i, '') // Roman numerals at end
    .replace(/\s+part\s*\d+\s*$/i, '')            // Part 1, Part 2
    .replace(/\s+day\s*\d+\s*$/i, '')             // Day 1, Day 2
    .replace(/\s*\(continued\)\s*$/i, '')         // (continued)
    .replace(/\s*\(cont\.?\)\s*$/i, '')           // (cont) or (cont.)
    .trim();
}

// Helper to parse midterm number from exam title
function parseMidtermNumber(title: string): number | null {
  const match = title.match(/(?:midterm|exam)\s*(\d)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

// Calculate which midterm a topic belongs to based on its week or date relative to exam dates
function calculateMidtermCoverage(
  topicDate: string | null,
  examDates: { midtermNumber: number; date: string; weekNumber?: number }[],
  topicWeek?: number | null
): number | null {
  if (examDates.length === 0) return null;

  // Prefer week-based comparison when both topic week and exam weeks are available
  if (topicWeek != null) {
    const examsWithWeek = examDates.filter(e => e.weekNumber != null);
    if (examsWithWeek.length > 0) {
      for (const exam of examsWithWeek) {
        if (topicWeek <= exam.weekNumber!) {
          return exam.midtermNumber;
        }
      }
      // Topic is after all midterms = Finals topic (null)
      return null;
    }
  }

  // Fall back to date-based comparison
  if (!topicDate) return null;
  for (const exam of examDates) {
    if (topicDate <= exam.date) {
      return exam.midtermNumber;
    }
  }

  // Topic is after all midterms = Finals topic (null)
  return null;
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

      // Fetch exam events to determine midterm coverage (include week_number)
      const { data: examEvents, error: examError } = await supabase
        .from("calendar_events")
        .select("title, event_date, week_number")
        .eq("course_pack_id", coursePackId)
        .eq("event_type", "exam")
        .order("week_number", { ascending: true })
        .order("event_date", { ascending: true });

      if (examError) throw examError;

      // Parse exam dates - only midterms (not finals)
      const examDates = (examEvents || [])
        .map(e => ({
          midtermNumber: parseMidtermNumber(e.title),
          date: e.event_date as string,
          weekNumber: e.week_number as number | undefined,
        }))
        .filter(e => e.midtermNumber !== null) as { midtermNumber: number; date: string; weekNumber?: number }[];
      examDates.sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0) || a.date.localeCompare(b.date));

      // Fetch existing topics to avoid duplicates
      const { data: existingTopics, error: topicsError } = await supabase
        .from("topics")
        .select("title")
        .eq("course_pack_id", coursePackId);

      if (topicsError) throw topicsError;

      // Build set of existing base topic names and section numbers for dedup
      const existingBaseTitles = new Set<string>();
      const existingSections = new Set<string>();
      for (const t of existingTopics || []) {
        existingBaseTitles.add(extractBaseTopicName(t.title).toLowerCase());
        const section = extractSectionNumber(t.title);
        if (section) existingSections.add(section);
      }

      // Group events by section number OR base topic name to consolidate multi-day topics
      // This ensures topics like "Interest Rates and Bond Valuation - Part 1" and "- Part 2" become ONE topic
      const consolidatedTopics = new Map<string, { 
        title: string; 
        description: string; 
        scheduled_week: number;
        event_date: string | null;
        partCount: number; // Track how many parts/days this topic spans
      }>();

      for (const event of events || []) {
        const normalizedTitle = event.title.trim();
        const section = extractSectionNumber(normalizedTitle);
        const baseTitle = extractBaseTopicName(normalizedTitle);
        
        // Use section number as key if available, otherwise use base title (lowercase for consistency)
        const consolidationKey = section || baseTitle.toLowerCase();
        
        // Skip if this section/base already exists in the database
        if (section && existingSections.has(section)) continue;
        if (!section && existingBaseTitles.has(baseTitle.toLowerCase())) continue;
        
        // If we haven't seen this topic yet, add it
        if (!consolidatedTopics.has(consolidationKey)) {
          consolidatedTopics.set(consolidationKey, {
            title: section ? normalizedTitle.replace(/\s*-\s*Part\s*\d+\s*$/i, '') : baseTitle, // Keep section prefix if present
            description: event.description || "",
            scheduled_week: event.week_number,
            event_date: event.event_date,
            partCount: 1,
          });
        } else {
          // We've seen this topic before - it's a multi-day topic
          // Just increment the part count, keep the first occurrence's data
          const existing = consolidatedTopics.get(consolidationKey)!;
          existing.partCount += 1;
        }
      }

      const topicsToCreate = Array.from(consolidatedTopics.values());

      if (topicsToCreate.length === 0) {
        return { created: 0, message: "No new topics to create" };
      }

      // Insert topics with calculated midterm_coverage (prefer week-based)
      const { error: insertError } = await supabase
        .from("topics")
        .insert(topicsToCreate.map(t => ({
          course_pack_id: coursePackId,
          title: t.title,
          description: t.description || null,
          scheduled_week: t.scheduled_week,
          midterm_coverage: calculateMidtermCoverage(t.event_date, examDates, t.scheduled_week),
        })));

      if (insertError) throw insertError;

      return { created: topicsToCreate.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

// Re-run week-based midterm assignment for all topics in a course
export function useRecalculateTopicMidterms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (coursePackId: string) => {
      // Fetch exam events with week numbers
      const { data: examEvents, error: examError } = await supabase
        .from("calendar_events")
        .select("title, event_date, week_number")
        .eq("course_pack_id", coursePackId)
        .eq("event_type", "exam")
        .order("week_number", { ascending: true });

      if (examError) throw examError;

      const examDates = (examEvents || [])
        .map(e => ({
          midtermNumber: parseMidtermNumber(e.title),
          date: e.event_date as string,
          weekNumber: e.week_number as number | undefined,
        }))
        .filter(e => e.midtermNumber !== null) as { midtermNumber: number; date: string; weekNumber?: number }[];
      examDates.sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0) || a.date.localeCompare(b.date));

      if (examDates.length === 0) {
        return { updated: 0, message: "No exam events found" };
      }

      // Fetch all topics for this course
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id, scheduled_week, midterm_coverage")
        .eq("course_pack_id", coursePackId);

      if (topicsError) throw topicsError;

      let updated = 0;
      for (const topic of topics || []) {
        const newCoverage = calculateMidtermCoverage(null, examDates, topic.scheduled_week);
        if (newCoverage !== topic.midterm_coverage) {
          const { error } = await supabase
            .from("topics")
            .update({ midterm_coverage: newCoverage })
            .eq("id", topic.id);
          if (!error) updated++;
        }
      }

      return { updated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
      queryClient.invalidateQueries({ queryKey: ["topics-by-midterm"] });
    },
  });
}

// Manual single-topic midterm reassignment
export function useUpdateTopicMidterm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topicId, midtermCoverage }: { topicId: string; midtermCoverage: number | null }) => {
      const { error } = await supabase
        .from("topics")
        .update({ midterm_coverage: midtermCoverage })
        .eq("id", topicId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
      queryClient.invalidateQueries({ queryKey: ["topics-by-midterm"] });
    },
  });
}