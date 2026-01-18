import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { Tables } from "@/integrations/supabase/types";

type CoursePack = Tables<"course_packs">;
type Topic = Tables<"topics">;

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (error) {
        console.error("Error checking admin role:", error);
        return false;
      }

      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Important: don't decide "not admin" before auth state has initialized.
  return {
    ...query,
    data: authLoading ? undefined : query.data,
    isLoading: authLoading || query.isLoading,
  };
}

export function useCoursePacks() {
  return useQuery({
    queryKey: ["course-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_packs")
        .select("*")
        .order("title");
      
      if (error) throw error;
      return data as CoursePack[];
    },
  });
}

export function useTopicsForPack(coursePackId: string | null) {
  return useQuery({
    queryKey: ["topics", coursePackId],
    queryFn: async () => {
      if (!coursePackId) return [];
      
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .eq("course_pack_id", coursePackId)
        .order("scheduled_week", { nullsFirst: false })
        .order("title");
      
      if (error) throw error;
      return data as Topic[];
    },
    enabled: !!coursePackId,
  });
}

export function useCoursePackMutations() {
  const queryClient = useQueryClient();

  const createPack = useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      const { data: pack, error } = await supabase
        .from("course_packs")
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return pack;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-packs"] });
    },
  });

  const updatePack = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; description?: string }) => {
      const { data: pack, error } = await supabase
        .from("course_packs")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return pack;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-packs"] });
    },
  });

  const deletePack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("course_packs")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-packs"] });
    },
  });

  return { createPack, updatePack, deletePack };
}

export function useTopicMutations() {
  const queryClient = useQueryClient();

  const createTopic = useMutation({
    mutationFn: async (data: { 
      course_pack_id: string; 
      title: string; 
      description?: string; 
      scheduled_week?: number;
    }) => {
      const { data: topic, error } = await supabase
        .from("topics")
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return topic;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["topics", variables.course_pack_id] });
    },
  });

  const updateTopic = useMutation({
    mutationFn: async ({ id, ...data }: { 
      id: string; 
      title?: string; 
      description?: string; 
      scheduled_week?: number | null;
      course_pack_id?: string;
    }) => {
      const { data: topic, error } = await supabase
        .from("topics")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return topic;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  const deleteTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("topics")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  return { createTopic, updateTopic, deleteTopic };
}
