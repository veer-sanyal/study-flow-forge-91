import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/hooks/use-auth';

export interface Enrollment {
  id: string;
  user_id: string;
  course_pack_id: string;
  enrolled_at: string;
}

export interface CoursePack {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
}

export function useEnrollments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's enrollments with course pack details
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_enrollments')
        .select(`
id,
  user_id,
  course_pack_id,
  enrolled_at,
  course_packs(
    id,
    title,
    description,
    is_published
  )
    `)
        .eq('user_id', user.id)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all available course packs
  const coursePacksQuery = useQuery({
    queryKey: ['course-packs-available'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_packs')
        .select('id, title, description, is_published')
        .eq('is_published', true)
        .order('title', { ascending: true });

      if (error) throw error;
      return data as CoursePack[];
    },
  });

  // Enroll in a course
  const enrollMutation = useMutation({
    mutationFn: async (coursePackId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('user_enrollments')
        .insert({
          user_id: user.id,
          course_pack_id: coursePackId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });

  // Unenroll from a course
  const unenrollMutation = useMutation({
    mutationFn: async (coursePackId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('user_enrollments')
        .delete()
        .eq('user_id', user.id)
        .eq('course_pack_id', coursePackId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });

  // Get enrolled course IDs for easy checking
  const enrolledCourseIds = new Set(
    enrollmentsQuery.data?.map(e => e.course_pack_id) || []
  );

  // Get as array for queries
  const enrolledCourseIdsArray = Array.from(enrolledCourseIds);

  return {
    enrollments: enrollmentsQuery.data || [],
    isLoadingEnrollments: enrollmentsQuery.isLoading,
    isFetchingEnrollments: enrollmentsQuery.isFetching,
    coursePacks: coursePacksQuery.data || [],
    isLoadingCoursePacks: coursePacksQuery.isLoading,
    enrolledCourseIds,
    enrolledCourseIdsArray,
    // Make these awaitable so callers can reliably gate navigation + show errors
    enroll: enrollMutation.mutateAsync,
    unenroll: unenrollMutation.mutateAsync,
    isEnrolling: enrollMutation.isPending,
    isUnenrolling: unenrollMutation.isPending,
  };
}
