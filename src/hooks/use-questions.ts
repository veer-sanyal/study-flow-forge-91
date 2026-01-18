import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Json } from "@/integrations/supabase/types";

type Question = Tables<"questions">;
type Topic = Tables<"topics">;

export interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionWithTopics extends Question {
  topics?: Topic[];
}

export function useQuestionsForReview() {
  return useQuery({
    queryKey: ["questions", "needs-review"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("needs_review", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Question[];
    },
  });
}

export function useAllQuestions(filters?: { 
  needsReview?: boolean; 
  sourceExam?: string;
  topicId?: string;
}) {
  return useQuery({
    queryKey: ["questions", filters],
    queryFn: async () => {
      let query = supabase
        .from("questions")
        .select("*")
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

      const { data, error } = await query;
      if (error) throw error;
      return data as Question[];
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

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}