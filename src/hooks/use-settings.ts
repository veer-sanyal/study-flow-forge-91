import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/hooks/use-auth';

export interface UserSettings {
  id: string;
  user_id: string;
  daily_goal: number;
  pace_offset: number;
  notifications_enabled: boolean;
  reduced_motion: boolean;
  theme: string;
  daily_plan_mode: 'single_course' | 'mixed';
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  daily_goal: 10,
  pace_offset: 1,
  notifications_enabled: true,
  reduced_motion: false,
  theme: 'system',
  daily_plan_mode: 'single_course',
};

export function useUserSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async (): Promise<UserSettings> => {
      if (!user) throw new Error('Not authenticated');

      // Try to fetch existing settings
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // If no settings exist, create default ones
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (insertError) throw insertError;
        return newSettings as UserSettings;
      }

      return data as UserSettings;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_settings')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as UserSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user-settings', user?.id], data);
    },
  });

  return {
    settings: query.data ?? {
      ...DEFAULT_SETTINGS,
      id: '',
      user_id: user?.id ?? '',
      created_at: '',
      updated_at: '',
    },
    isLoading: query.isLoading,
    error: query.error,
    // Make awaitable (Onboarding uses `await updateSettings(...)`)
    updateSettings: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}