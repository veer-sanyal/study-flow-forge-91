import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook that runs FSRS maintenance on app load/reload
 * Updates FSRS elapsed_days for the current user
 * Runs silently in the background without blocking UI
 * 
 * Runs on every page reload. Uses a ref to prevent duplicate calls
 * during the same component mount (e.g., React strict mode)
 */
export function useFsrsMaintenance() {
  const { user } = useAuth();
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run for authenticated users
    if (!user) {
      hasRunRef.current = false; // Reset when user logs out
      return;
    }

    // Prevent duplicate calls during the same component mount
    // (e.g., React strict mode double-rendering)
    // On page reload, the component remounts, so ref resets and it runs again
    if (hasRunRef.current) {
      return;
    }

    // Mark as run for this mount
    hasRunRef.current = true;

    // Run user-specific FSRS maintenance in the background (don't await, fire and forget)
    // This only updates the current user's FSRS state, not all users
    (async () => {
      try {
        const { data, error } = await supabase
          .rpc('recalculate_fsrs_for_user' as 'build_daily_plan', { p_user_id: user.id } as any);
        if (error) {
          console.error('FSRS maintenance error:', error);
        } else {
          console.log('FSRS maintenance completed:', data);
        }
      } catch (error) {
        console.error('FSRS maintenance failed:', error);
      }
    })();
  }, [user]);
}
