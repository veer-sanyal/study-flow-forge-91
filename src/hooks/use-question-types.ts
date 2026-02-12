import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/integrations/supabase/types";

type QuestionType = Tables<"question_types">;

export interface QuestionTypeWithCount extends QuestionType {
  questionCount: number;
  coursePack?: { id: string; title: string } | null;
}

export interface QuestionTypeWithMidtermCounts extends QuestionType {
  coursePack?: { id: string; title: string } | null;
  midtermGroups: {
    midtermNumber: number | null;
    label: string;
    questionCount: number;
  }[];
  totalCount: number;
}

// Fetch all question types with question counts
export function useQuestionTypesWithCounts(coursePackId?: string) {
  return useQuery({
    queryKey: ["question-types-with-counts", coursePackId],
    queryFn: async () => {
      // Get question types
      let typesQuery = supabase
        .from("question_types")
        .select("*, course_packs(id, title)")
        .order("name");

      if (coursePackId) {
        typesQuery = typesQuery.eq("course_pack_id", coursePackId);
      }

      const { data: types, error: typesError } = await typesQuery;
      if (typesError) throw typesError;

      // Get question counts by type
      let countQuery = supabase
        .from("questions")
        .select("question_type_id, id");

      if (coursePackId) {
        countQuery = countQuery.eq("course_pack_id", coursePackId);
      }

      const { data: questions, error: questionsError } = await countQuery;
      if (questionsError) throw questionsError;

      // Count questions per type
      const countMap = new Map<string, number>();
      questions?.forEach((q) => {
        if (q.question_type_id) {
          countMap.set(q.question_type_id, (countMap.get(q.question_type_id) || 0) + 1);
        }
      });

      return types.map((type) => ({
        ...type,
        questionCount: countMap.get(type.id) || 0,
        coursePack: type.course_packs,
      })) as QuestionTypeWithCount[];
    },
  });
}

// Fetch question types grouped by midterm with counts
export function useQuestionTypesGroupedByMidterm(coursePackId: string) {
  return useQuery({
    queryKey: ["question-types-by-midterm", coursePackId],
    queryFn: async () => {
      // Get question types for course
      const { data: types, error: typesError } = await supabase
        .from("question_types")
        .select("*")
        .eq("course_pack_id", coursePackId)
        .order("name");

      if (typesError) throw typesError;

      // Get questions with type and midterm info
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("question_type_id, midterm_number")
        .eq("course_pack_id", coursePackId);

      if (questionsError) throw questionsError;

      // Build type -> midterm -> count map
      const typeMap = new Map<string, Map<number | null, number>>();

      questions?.forEach((q) => {
        if (!q.question_type_id) return;

        if (!typeMap.has(q.question_type_id)) {
          typeMap.set(q.question_type_id, new Map());
        }

        const midtermMap = typeMap.get(q.question_type_id)!;
        const midterm = q.midterm_number;
        midtermMap.set(midterm, (midtermMap.get(midterm) || 0) + 1);
      });

      // Transform to output structure
      const result: QuestionTypeWithMidtermCounts[] = types.map((type) => {
        const midtermMap = typeMap.get(type.id) || new Map();
        const midtermGroups: { midtermNumber: number | null; label: string; questionCount: number }[] = [];

        // Sort and format midterm groups
        const sortedMidterms = [...midtermMap.entries()].sort((a, b) => {
          if (a[0] === null) return 1;
          if (b[0] === null) return -1;
          return (a[0] ?? 0) - (b[0] ?? 0);
        });

        sortedMidterms.forEach(([midterm, count]) => {
          let label = "Unassigned";
          if (midterm === 0) label = "Final";
          else if (midterm !== null) label = `Midterm ${midterm}`;

          midtermGroups.push({
            midtermNumber: midterm,
            label,
            questionCount: count,
          });
        });

        return {
          ...type,
          midtermGroups,
          totalCount: [...midtermMap.values()].reduce((a, b) => a + b, 0),
        };
      });

      return result;
    },
    enabled: !!coursePackId,
  });
}

// Create a new question type
export function useCreateQuestionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      coursePackId,
      aliases,
    }: {
      name: string;
      description?: string;
      coursePackId: string;
      aliases?: string[];
    }) => {
      const { data, error } = await supabase
        .from("question_types")
        .insert({
          name,
          description: description || null,
          course_pack_id: coursePackId,
          aliases: aliases || [],
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question-types"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-with-counts"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-by-midterm"] });
    },
  });
}

// Update an existing question type
export function useUpdateQuestionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      aliases,
      status,
    }: {
      id: string;
      name?: string;
      description?: string | null;
      aliases?: string[];
      status?: string;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (aliases !== undefined) updates.aliases = aliases;
      if (status !== undefined) updates.status = status;

      const { data, error } = await supabase
        .from("question_types")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question-types"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-with-counts"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-by-midterm"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

// Delete a question type
export function useDeleteQuestionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("question_types")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question-types"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-with-counts"] });
      queryClient.invalidateQueries({ queryKey: ["question-types-by-midterm"] });
    },
  });
}

// Topics with question counts
export interface TopicWithCount {
  id: string;
  title: string;
  description: string | null;
  midterm_coverage: number | null;
  scheduled_week: number | null;
  course_pack_id: string | null;
  questionCount: number;
}

export interface TopicGroup {
  midtermNumber: number | null;
  label: string;
  topics: TopicWithCount[];
  totalQuestions: number;
}

export function useTopicsWithCounts(coursePackId: string) {
  return useQuery({
    queryKey: ["topics-with-counts", coursePackId],
    queryFn: async () => {
      // Get topics
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id, title, description, midterm_coverage, scheduled_week, course_pack_id")
        .eq("course_pack_id", coursePackId)
        .order("scheduled_week", { ascending: true, nullsFirst: true })
        .order("title");

      if (topicsError) throw topicsError;

      // Get questions with topic_ids
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("topic_ids")
        .eq("course_pack_id", coursePackId);

      if (questionsError) throw questionsError;

      // Count questions per topic
      const countMap = new Map<string, number>();
      questions?.forEach((q) => {
        if (Array.isArray(q.topic_ids)) {
          q.topic_ids.forEach((topicId: string) => {
            countMap.set(topicId, (countMap.get(topicId) || 0) + 1);
          });
        }
      });

      const topicsWithCounts: TopicWithCount[] = topics.map((t) => ({
        ...t,
        questionCount: countMap.get(t.id) || 0,
      }));

      // Group by midterm
      const groupMap = new Map<number | null, TopicWithCount[]>();

      topicsWithCounts.forEach((topic) => {
        const key = topic.midterm_coverage;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(topic);
      });

      // Sort and format groups
      const sortedKeys = [...groupMap.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return (a ?? 0) - (b ?? 0);
      });

      const groups: TopicGroup[] = sortedKeys.map((key) => {
        const topics = groupMap.get(key)!;
        let label = "Uncategorized";
        if (key === 0) label = "Final Topics";
        else if (key !== null) label = `Midterm ${key} Topics`;

        return {
          midtermNumber: key,
          label,
          topics,
          totalQuestions: topics.reduce((sum, t) => sum + t.questionCount, 0),
        };
      });

      return { topics: topicsWithCounts, groups };
    },
    enabled: !!coursePackId,
  });
}
