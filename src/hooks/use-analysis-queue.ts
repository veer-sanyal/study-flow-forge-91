import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface QueuedExam {
  coursePackId: string;
  sourceExam: string;
  questionIds: string[];
}

export interface AnalysisJob {
  id: string;
  course_pack_id: string;
  source_exam: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_questions: number;
  completed_questions: number;
  failed_questions: number;
  current_question_id: string | null;
  current_question_prompt: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Hook for managing the analysis queue - supports multiple exams processed sequentially
 */
export function useAnalysisQueue() {
  const queryClient = useQueryClient();

  // Fetch all recent analysis jobs (pending, running, and recent completed)
  const { data: jobs } = useQuery({
    queryKey: ["analysis-jobs-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_jobs")
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as unknown as AnalysisJob[]) || [];
    },
    refetchInterval: 2000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("analysis-queue-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_jobs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["analysis-jobs-queue"] });
          queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Queue multiple exams for analysis (they will be processed sequentially)
  const queueExamsForAnalysis = useMutation({
    mutationFn: async (exams: QueuedExam[]) => {
      const results: { sourceExam: string; jobId?: string; error?: string }[] = [];

      for (const exam of exams) {
        try {
          const { data, error } = await supabase.functions.invoke("batch-analyze-questions", {
            body: {
              coursePackId: exam.coursePackId,
              sourceExam: exam.sourceExam,
              questionIds: exam.questionIds,
            },
          });

          if (error) {
            results.push({ sourceExam: exam.sourceExam, error: error.message });
          } else if (data?.error) {
            results.push({ sourceExam: exam.sourceExam, error: data.error });
          } else {
            results.push({ sourceExam: exam.sourceExam, jobId: data.jobId });
          }
        } catch (err) {
          results.push({ 
            sourceExam: exam.sourceExam, 
            error: err instanceof Error ? err.message : "Unknown error" 
          });
        }
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-queue"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
    },
  });

  // Cancel a specific job
  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("analysis_jobs")
        .update({ status: "cancelled" } as any)
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-queue"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
    },
  });

  // Derived state
  const pendingJobs = jobs?.filter(j => j.status === "pending") || [];
  const runningJob = jobs?.find(j => j.status === "running") || null;
  const isProcessing = runningJob !== null || pendingJobs.length > 0;
  const totalQueued = pendingJobs.length + (runningJob ? 1 : 0);

  return {
    jobs: jobs || [],
    pendingJobs,
    runningJob,
    isProcessing,
    totalQueued,
    queueExamsForAnalysis,
    cancelJob,
  };
}
