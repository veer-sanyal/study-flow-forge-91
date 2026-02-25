import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { supabase, invokeEdgeFunction } from "@/lib/supabase";
import type {
  SimplifiedQuestion,
  GenerateOneQuestionResult,
  GenerateOneQuestionError,
} from "@/types/simplified-question";

// ─── Batch generation types ───────────────────────────────────────────────────

interface ChunkInfo {
  chunkIndex: number;
  target: number;
  summary: string;
}

/** Response from init mode: { materialId } */
interface InitResponse {
  success: true;
  jobId: string;
  fileUri: string;
  chunks: ChunkInfo[];
  totalQuestionsTarget: number;
}

interface BatchGenerateStartError {
  success: false;
  error: string;
}

/**
 * Parameters for generating a single question.
 */
interface GenerateOneParams {
  lectureContent?: string;
  materialId?: string;
  existingQuestions?: string[];
}

/**
 * Hook for generating a single MCQ from lecture content or a material ID.
 *
 * @example
 * ```tsx
 * const { mutate, isPending, data, error } = useGenerateOneQuestion();
 *
 * // From raw content
 * mutate({ lectureContent: "..." });
 *
 * // From uploaded material
 * mutate({ materialId: "uuid-..." });
 * ```
 */
export function useGenerateOneQuestion() {
  return useMutation<GenerateOneQuestionResult, Error, GenerateOneParams>({
    mutationFn: async ({ lectureContent, materialId, existingQuestions }) => {
      const { data, error } = await invokeEdgeFunction<GenerateOneQuestionResult>(
        "generate-one-question",
        {
          body: {
            lectureContent,
            materialId,
            existingQuestions,
          },
        }
      );

      if (error) {
        throw new Error(`Function invocation failed: ${error.message}`);
      }

      if (!data) {
        throw new Error("No response from generate-one-question function");
      }

      return data;
    },
  });
}

/**
 * Result of generating multiple questions.
 */
interface GenerateMultipleResult {
  questions: SimplifiedQuestion[];
  errors: string[];
}

/**
 * Parameters for generating multiple questions.
 */
interface GenerateMultipleParams {
  lectureContent?: string;
  materialId?: string;
  count: number;
  existingQuestions?: string[];
  delayMs?: number;  // Delay between calls (default: 500ms)
}

/**
 * Progress callback for multi-question generation.
 */
interface GenerateProgress {
  completed: number;
  total: number;
  currentQuestion: SimplifiedQuestion | null;
}

/**
 * Hook for generating multiple MCQs sequentially with deduplication.
 *
 * Generates N questions one at a time, passing existing stems to avoid
 * duplicates. Includes a configurable delay between API calls.
 *
 * @example
 * ```tsx
 * const {
 *   generate,
 *   isGenerating,
 *   progress,
 *   questions,
 *   errors,
 *   reset,
 * } = useGenerateMultipleQuestions();
 *
 * const handleGenerate = async () => {
 *   const result = await generate({
 *     lectureContent: "...",
 *     count: 5,
 *   });
 *   console.log(`Generated ${result.questions.length} questions`);
 * };
 * ```
 */
export function useGenerateMultipleQuestions() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerateProgress>({
    completed: 0,
    total: 0,
    currentQuestion: null,
  });
  const [questions, setQuestions] = useState<SimplifiedQuestion[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress({ completed: 0, total: 0, currentQuestion: null });
    setQuestions([]);
    setErrors([]);
  }, []);

  const generate = useCallback(
    async ({
      lectureContent,
      materialId,
      count,
      existingQuestions = [],
      delayMs = 500,
    }: GenerateMultipleParams): Promise<GenerateMultipleResult> => {
      reset();
      setIsGenerating(true);
      setProgress({ completed: 0, total: count, currentQuestion: null });

      const generatedQuestions: SimplifiedQuestion[] = [];
      const generationErrors: string[] = [];

      // Build list of stems to avoid (existing + newly generated)
      const stemsToAvoid = [...existingQuestions];

      for (let i = 0; i < count; i++) {
        try {
          const { data, error } = await invokeEdgeFunction<GenerateOneQuestionResult>(
            "generate-one-question",
            {
              body: {
                lectureContent,
                materialId,
                existingQuestions: stemsToAvoid,
              },
            }
          );

          if (error) {
            generationErrors.push(`Question ${i + 1}: ${error.message}`);
          } else if (!data) {
            generationErrors.push(`Question ${i + 1}: No response from function`);
          } else if (!data.success) {
            generationErrors.push(`Question ${i + 1}: ${(data as GenerateOneQuestionError).error}`);
          } else {
            generatedQuestions.push(data.question);
            stemsToAvoid.push(data.question.stem);

            setProgress({
              completed: i + 1,
              total: count,
              currentQuestion: data.question,
            });
            setQuestions([...generatedQuestions]);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          generationErrors.push(`Question ${i + 1}: ${errorMessage}`);
        }

        // Delay between calls (except after the last one)
        if (i < count - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      setErrors(generationErrors);
      setIsGenerating(false);
      setProgress((prev) => ({ ...prev, completed: count }));

      return {
        questions: generatedQuestions,
        errors: generationErrors,
      };
    },
    [reset]
  );

  return {
    generate,
    isGenerating,
    progress,
    questions,
    errors,
    reset,
  };
}

/**
 * Hook for generating questions and saving them to the database.
 *
 * Combines question generation with database insertion for a complete workflow.
 */
export function useGenerateAndSaveQuestions() {
  const queryClient = useQueryClient();
  const { generate, isGenerating, progress, questions, errors, reset } =
    useGenerateMultipleQuestions();

  const generateAndSave = useCallback(
    async ({
      lectureContent,
      materialId,
      count,
      coursePackId,
      existingQuestions = [],
    }: GenerateMultipleParams & {
      coursePackId: string;
    }): Promise<{ saved: number; errors: string[] }> => {
      const result = await generate({
        lectureContent,
        materialId,
        count,
        existingQuestions,
      });

      if (result.questions.length === 0) {
        return { saved: 0, errors: result.errors };
      }

      // Insert generated questions into the database
      const insertErrors: string[] = [...result.errors];
      let savedCount = 0;

      for (const question of result.questions) {
        try {
          // Transform SimplifiedQuestion to database format
          const dbQuestion = {
            course_pack_id: coursePackId,
            prompt: question.stem,
            question_format: "multiple_choice",
            choices: question.choices.map((c) => ({
              id: c.id.toLowerCase(),
              text: c.text,
              isCorrect: c.isCorrect,
            })),
            correct_answer: question.choices.find((c) => c.isCorrect)?.id.toLowerCase() || "a",
            difficulty: question.difficulty,
            source: "generated",
            source_material_id: materialId || null,
            status: "draft",
            // Set answer_spec for MCQ
            answer_spec: {
              correct_choice_ids: [
                question.choices.find((c) => c.isCorrect)?.id.toLowerCase() || "a",
              ],
            },
            grading_spec: {
              partial_credit: false,
            },
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertError } = await supabase
            .from("questions")
            .insert(dbQuestion as any);

          if (insertError) {
            insertErrors.push(`Failed to save question: ${insertError.message}`);
          } else {
            savedCount++;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          insertErrors.push(`Failed to save question: ${errorMessage}`);
        }
      }

      // Update material's questions_generated_count
      if (materialId && savedCount > 0) {
        const { data: material } = await supabase
          .from("course_materials")
          .select("questions_generated_count")
          .eq("id", materialId)
          .single();

        const currentCount = (material?.questions_generated_count as number) || 0;

        await supabase
          .from("course_materials")
          .update({
            questions_generated_count: currentCount + savedCount,
            status: "ready",
          })
          .eq("id", materialId);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["course-material"] });

      return {
        saved: savedCount,
        errors: insertErrors,
      };
    },
    [generate, queryClient]
  );

  return {
    generateAndSave,
    isGenerating,
    progress,
    questions,
    errors,
    reset,
  };
}

// ─── Client-driven chunk loop ─────────────────────────────────────────────────

/**
 * Processes all chunks with concurrency=2, then calls the finalize mode.
 * Runs as a fire-and-forget promise from startJob — browser must stay open.
 */
async function runChunkLoop(
  jobId: string,
  fileUri: string,
  chunks: ChunkInfo[]
): Promise<void> {
  const CONCURRENCY = 2;
  const queue = [...chunks];

  // Each worker pulls from the shared queue until empty
  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;
      try {
        await invokeEdgeFunction("generate-questions-batch", {
          body: { jobId, fileUri, chunkIndex: chunk.chunkIndex },
        });
      } catch (err) {
        console.warn(`[batch-gen] chunk ${chunk.chunkIndex} failed:`, err instanceof Error ? err.message : err);
        // Continue with the next chunk rather than aborting the whole run
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Finalize: dedup all saved questions and mark job completed
  try {
    await invokeEdgeFunction("generate-questions-batch", {
      body: { jobId, finalize: true },
    });
  } catch (err) {
    console.error("[batch-gen] finalize failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Hook for starting a parallel batch generation job for an entire material.
 *
 * Architecture (client-driven):
 * - Phase 1 (init): uploads PDF to Gemini, creates job row, returns chunk list
 * - Phase 2 (chunks): client loops with concurrency=2; each call generates one
 *   chunk and saves immediately (~5-10s per call, no waitUntil timeout risk)
 * - Phase 3 (finalize): dedup all saved questions, mark job completed
 *
 * Returns as soon as the init call completes. The chunk loop runs in the
 * background. Consumers poll progress via `useGenerationJobStatus`.
 *
 * @example
 * ```tsx
 * const { startJob, isStarting, error } = useBatchGenerateFromMaterial();
 *
 * const handleBatch = async () => {
 *   const { jobId, totalQuestionsTarget } = await startJob(materialId);
 *   console.log(`Job ${jobId} started — targeting ${totalQuestionsTarget} questions`);
 * };
 * ```
 */
export function useBatchGenerateFromMaterial(): {
  startJob: (materialId: string) => Promise<{ jobId: string; totalQuestionsTarget: number }>;
  isStarting: boolean;
  error: Error | null;
} {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startJob = useCallback(
    async (materialId: string): Promise<{ jobId: string; totalQuestionsTarget: number }> => {
      setIsStarting(true);
      setError(null);

      try {
        // Phase 1: Init — upload PDF, create job row, get chunk list
        const { data, error: fnError } = await invokeEdgeFunction<
          InitResponse | BatchGenerateStartError
        >("generate-questions-batch", { body: { materialId } });

        if (fnError) {
          throw new Error(`Function invocation failed: ${fnError.message}`);
        }
        if (!data) {
          throw new Error("No response from generate-questions-batch function");
        }
        if (!data.success) {
          throw new Error((data as BatchGenerateStartError).error);
        }

        const { jobId, fileUri, chunks, totalQuestionsTarget } = data as InitResponse;

        // Phase 2 + 3: chunk loop + finalize — fire-and-forget so UI returns immediately
        runChunkLoop(jobId, fileUri, chunks).catch((err) => {
          console.error("[batch-gen] unhandled chunk loop error:", err instanceof Error ? err.message : err);
        });

        return { jobId, totalQuestionsTarget };
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error("Unknown error");
        setError(wrapped);
        throw wrapped;
      } finally {
        setIsStarting(false);
      }
    },
    []
  );

  return { startJob, isStarting, error };
}

/**
 * Subscribe to live updates for a generation job.
 *
 * Returns the latest `generation_jobs` row for the given jobId.
 * Uses a simple polling approach to avoid requiring Realtime subscription setup.
 *
 * @example
 * ```tsx
 * const { job } = useGenerationJobStatus(jobId);
 * if (job?.status === 'completed') { ... }
 * ```
 */
export function useGenerationJobStatus(jobId: string | null): {
  job: {
    id: string;
    status: string;
    total_chunks: number;
    completed_chunks: number;
    failed_chunks: number;
    total_questions_target: number;
    total_questions_generated: number;
    current_chunk_summary: string | null;
    error_message: string | null;
  } | null;
  isLoading: boolean;
} {
  const [job, setJob] = useState<{
    id: string;
    status: string;
    total_chunks: number;
    completed_chunks: number;
    failed_chunks: number;
    total_questions_target: number;
    total_questions_generated: number;
    current_chunk_summary: string | null;
    error_message: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("generation_jobs")
        .select(
          "id, status, total_chunks, completed_chunks, failed_chunks, total_questions_target, total_questions_generated, current_chunk_summary, error_message"
        )
        .eq("id", jobId)
        .single();
      if (data) setJob(data as typeof job);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Initial fetch + poll every 3s; stops once job reaches a terminal state
  useEffect(() => {
    if (!jobId) return;

    let stopped = false;
    fetchJob();

    const interval = setInterval(async () => {
      if (stopped) return;
      await fetchJob();
      setJob((current) => {
        if (current?.status === "completed" || current?.status === "failed") {
          stopped = true;
          clearInterval(interval);
        }
        return current;
      });
    }, 3000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { job, isLoading };
}
