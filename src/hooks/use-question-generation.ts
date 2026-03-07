/**
 * use-question-generation.ts — V2 hooks for the 3-phase question generation flow
 *
 * useAnalyzeMaterial()        — triggers analyze-material edge function
 * useGenerateQuestions()      — triggers generate-questions edge function
 * useGenerationJobRealtime()  — subscribes to job updates via Supabase Realtime
 */

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeEdgeFunction } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerationJob {
  id: string;
  material_id: string;
  status: "running" | "pending" | "completed" | "failed";
  total_questions_target: number;
  total_questions_generated: number;
  pre_run_count: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── useAnalyzeMaterial ───────────────────────────────────────────────────────

export function useAnalyzeMaterial(): ReturnType<typeof useMutation<{ queued: boolean }, Error, string>> {
  const queryClient = useQueryClient();

  return useMutation<{ queued: boolean }, Error, string>({
    mutationFn: async (materialId: string) => {
      const { data, error } = await invokeEdgeFunction<{
        queued: boolean;
        error?: string;
      }>("analyze-material", { body: { materialId } });

      if (error) throw new Error(`Function error: ${error.message}`);
      if (!data) throw new Error("No response from analyze-material");

      return { queued: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["course-material"] });
    },
  });
}

// ─── useGenerateQuestions ─────────────────────────────────────────────────────

interface GenerateResult {
  jobId: string;
}

export function useGenerateQuestions(): {
  generate: (materialId: string, count?: number) => Promise<string>;
  isPending: boolean;
} {
  const [isPending, setIsPending] = useState(false);

  const generate = useCallback(async (materialId: string, count?: number): Promise<string> => {
    setIsPending(true);
    try {
      const { data, error } = await invokeEdgeFunction<GenerateResult>(
        "generate-questions",
        { body: { materialId, count } }
      );

      if (error) throw error;
      if (!data?.jobId) throw new Error("No jobId returned");

      return data.jobId;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { generate, isPending };
}

// ─── useGenerationJobRealtime ─────────────────────────────────────────────────

export function useGenerationJobRealtime(jobId: string | null): {
  job: GenerationJob | null;
  isLoading: boolean;
} {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    setIsLoading(true);

    // Initial fetch
    supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) setJob(data as unknown as GenerationJob);
        setIsLoading(false);
      });

    // Subscribe to Realtime updates
    const channel = supabase
      .channel(`generation-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generation_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as unknown as GenerationJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, isLoading };
}
