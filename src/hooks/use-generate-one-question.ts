import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  SimplifiedQuestion,
  GenerateOneQuestionResult,
} from "@/types/simplified-question";

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
      const { data, error } = await supabase.functions.invoke<GenerateOneQuestionResult>(
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
          const { data, error } = await supabase.functions.invoke<GenerateOneQuestionResult>(
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
            generationErrors.push(`Question ${i + 1}: ${data.error}`);
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
            source_type: "generated",
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

          const { error: insertError } = await supabase
            .from("questions")
            .insert(dbQuestion as unknown);

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
