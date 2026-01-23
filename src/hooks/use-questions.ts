import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Json } from "@/integrations/supabase/types";

type Question = Tables<"questions">;
type Topic = Tables<"topics">;
type QuestionType = Tables<"question_types">;

export interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionWithDetails extends Question {
  topics?: Topic[];
  question_types?: { id: string; name: string } | null;
}

export function useQuestionsForReview() {
  return useQuery({
    queryKey: ["questions", "needs-review"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, question_types(id, name)")
        .eq("needs_review", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as QuestionWithDetails[];
    },
  });
}

export function useAllQuestions(filters?: { 
  needsReview?: boolean; 
  sourceExam?: string;
  topicId?: string;
  coursePackId?: string;
}) {
  return useQuery({
    queryKey: ["questions", filters],
    queryFn: async () => {
      let query = supabase
        .from("questions")
        .select("*, question_types(id, name)")
        .order("midterm_number", { ascending: true, nullsFirst: false })
        .order("question_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (filters?.needsReview !== undefined) {
        query = query.eq("needs_review", filters.needsReview);
      }
      if (filters?.sourceExam) {
        query = query.eq("source_exam", filters.sourceExam);
      }
      if (filters?.topicId) {
        query = query.contains("topic_ids", [filters.topicId]);
      }
      // Note: coursePackId filter would require joining through topics or question_types
      // For now, we'll filter by question_type's course_pack_id if needed

      const { data, error } = await query;
      if (error) throw error;
      return data as QuestionWithDetails[];
    },
  });
}

export function useQuestionsByCoursePack(coursePackId: string | null) {
  return useQuery({
    queryKey: ["questions", "by-course-pack", coursePackId],
    queryFn: async () => {
      if (!coursePackId) return [];
      
      // Get questions that have question_types belonging to this course pack
      const { data, error } = await supabase
        .from("questions")
        .select("*, question_types!inner(id, name, course_pack_id)")
        .eq("question_types.course_pack_id", coursePackId)
        .order("midterm_number", { ascending: true, nullsFirst: false })
        .order("question_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as QuestionWithDetails[];
    },
    enabled: !!coursePackId,
  });
}

export function useQuestionTypes(coursePackId?: string) {
  return useQuery({
    queryKey: ["question-types", coursePackId],
    queryFn: async () => {
      let query = supabase
        .from("question_types")
        .select("*")
        .order("name");

      if (coursePackId) {
        query = query.eq("course_pack_id", coursePackId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (QuestionType & { course_pack_id: string | null; aliases: string[] | null })[];
    },
  });
}

export function useAllTopics() {
  return useQuery({
    queryKey: ["all-topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*, course_packs(title)")
        .order("title");

      if (error) throw error;
      return data as (Topic & { course_packs: { title: string } | null })[];
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      prompt?: string;
      choices?: Json;
      correct_answer?: string | null;
      topic_ids?: string[];
      unmapped_topic_suggestions?: string[] | null;
      needs_review?: boolean;
      difficulty?: number | null;
      hint?: string | null;
      solution_steps?: Json | null;
      source_exam?: string | null;
      midterm_number?: number | null;
      question_order?: number | null;
      image_url?: string | null;
      subparts?: Json | null;
      question_format?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("questions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useQuestionStats() {
  return useQuery({
    queryKey: ["question-stats"],
    queryFn: async () => {
      const { data: all, error: allError } = await supabase
        .from("questions")
        .select("id, needs_review, source_exam, midterm_number");

      if (allError) throw allError;

      const total = all?.length || 0;
      const needsReview = all?.filter(q => q.needs_review).length || 0;
      const approved = total - needsReview;
      
      // Get unique source exams with midterm info
      const examMap = new Map<string, Set<number>>();
      all?.forEach(q => {
        if (q.source_exam) {
          if (!examMap.has(q.source_exam)) {
            examMap.set(q.source_exam, new Set());
          }
          if (q.midterm_number) {
            examMap.get(q.source_exam)!.add(q.midterm_number);
          }
        }
      });
      
      const sourceExams = [...new Set(all?.map(q => q.source_exam).filter(Boolean) as string[])];

      return { total, needsReview, approved, sourceExams, examMap: Object.fromEntries(examMap) };
    },
  });
}

export function useUploadQuestionImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questionId, file }: { questionId: string; file: File }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${questionId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('question-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(filePath);

      // Update question with image URL
      const { error: updateError } = await supabase
        .from('questions')
        .update({ image_url: publicUrl })
        .eq('id', questionId);

      if (updateError) throw updateError;

      // Process the image to remove background
      try {
        const { data: processData, error: processError } = await supabase.functions.invoke(
          'process-question-image',
          {
            body: { imageUrl: publicUrl, questionId }
          }
        );

        if (processError) {
          console.error('Image processing error:', processError);
          // Return original URL if processing fails
          return publicUrl;
        }

        if (processData?.processedUrl && processData.processedUrl !== publicUrl) {
          console.log('Image processed, new URL:', processData.processedUrl);
          return processData.processedUrl;
        }
      } catch (err) {
        console.error('Failed to process image:', err);
      }

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
    },
  });
}

export function useRemoveQuestionImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase
        .from('questions')
        .update({ image_url: null })
        .eq('id', questionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
    },
  });
}