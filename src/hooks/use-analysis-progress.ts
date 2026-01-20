import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useAnalysisProgress() {
  const [activeJob, setActiveJob] = useState<AnalysisJob | null>(null);
  const queryClient = useQueryClient();

  // Fetch active analysis jobs
  const { data: jobs } = useQuery({
    queryKey: ["analysis-jobs-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_jobs")
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data as unknown as AnalysisJob[]) || [];
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("analysis-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_jobs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Update active job when data changes
  useEffect(() => {
    if (jobs && jobs.length > 0) {
      setActiveJob(jobs[0]);
    } else {
      setActiveJob(null);
    }
  }, [jobs]);

  // Start batch analysis
  const startBatchAnalysis = useMutation({
    mutationFn: async (params: {
      coursePackId: string;
      sourceExam: string;
      questionIds: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("batch-analyze-questions", {
        body: params,
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
    },
  });

  // Cancel analysis job
  const cancelAnalysis = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("analysis_jobs")
        .update({ status: "cancelled" } as any)
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs-active"] });
    },
  });

  // Calculate derived values
  const progress = activeJob;
  const elapsedMs = progress?.started_at ? Date.now() - new Date(progress.started_at).getTime() : 0;
  const completedCount = progress?.completed_questions || 0;
  const avgTimePerQuestion = completedCount > 0 ? elapsedMs / completedCount : 0;
  const remainingQuestions = progress ? progress.total_questions - completedCount - (progress.failed_questions || 0) : 0;
  const estimatedRemainingMs = avgTimePerQuestion * remainingQuestions;

  return {
    progress,
    startBatchAnalysis,
    cancelAnalysis,
    elapsedMs,
    avgTimePerQuestion,
    estimatedRemainingMs,
    remainingQuestions,
    isAnalyzing: progress?.status === "running" || progress?.status === "pending",
  };
}
