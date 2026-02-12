import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface DiagnosticCompletion {
  id: string;
  user_id: string;
  course_pack_id: string;
  completed_at: string;
  questions_answered: number;
  questions_correct: number;
  skipped: boolean;
}

export function useDiagnosticCompletions(): {
  completions: DiagnosticCompletion[];
  isLoading: boolean;
  completedCourseIds: Set<string>;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['diagnostic-completions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('diagnostic_completions')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data || []) as DiagnosticCompletion[];
    },
  });

  const completedCourseIds = new Set(
    query.data?.map(c => c.course_pack_id) || []
  );

  return {
    completions: query.data || [],
    isLoading: query.isLoading,
    completedCourseIds,
  };
}

interface RecordDiagnosticParams {
  coursePackId: string;
  questionsAnswered: number;
  questionsCorrect: number;
  skipped?: boolean;
}

export function useRecordDiagnosticCompletion(): {
  recordCompletion: (params: RecordDiagnosticParams) => Promise<void>;
  isRecording: boolean;
} {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ coursePackId, questionsAnswered, questionsCorrect, skipped = false }: RecordDiagnosticParams) => {
      if (!user) throw new Error("No user");

      const { error } = await supabase
        .from('diagnostic_completions')
        .upsert({
          user_id: user.id,
          course_pack_id: coursePackId,
          completed_at: new Date().toISOString(),
          questions_answered: questionsAnswered,
          questions_correct: questionsCorrect,
          skipped,
        }, { onConflict: 'user_id, course_pack_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-completions'] });
    },
  });

  return {
    recordCompletion: mutation.mutateAsync,
    isRecording: mutation.isPending,
  };
}

export function useDeleteDiagnosticCompletion(): {
  deleteCompletion: (coursePackId: string) => Promise<void>;
  isDeleting: boolean;
} {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (coursePackId: string) => {
      if (!user) throw new Error("No user");

      const { error } = await supabase
        .from('diagnostic_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('course_pack_id', coursePackId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-completions'] });
    },
  });

  return {
    deleteCompletion: mutation.mutateAsync,
    isDeleting: mutation.isPending,
  };
}
