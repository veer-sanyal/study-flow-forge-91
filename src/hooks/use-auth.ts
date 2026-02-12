import { useCallback, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthSnapshot = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

let snapshot: AuthSnapshot = {
  user: null,
  session: null,
  loading: true,
};

let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSnapshot(next: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Keep a single, global subscription so all components share the same auth state.
  supabase.auth.onAuthStateChange((_event, session) => {
    setSnapshot({
      session,
      user: session?.user ?? null,
      loading: false,
    });
  });

  // Hydrate initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSnapshot({
      session,
      user: session?.user ?? null,
      loading: false,
    });
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthSnapshot>(snapshot);

  useEffect(() => {
    ensureInitialized();

    const onChange = () => setState(snapshot);
    listeners.add(onChange);

    // Sync immediately in case init updated before subscription was added
    setState(snapshot);

    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  return {
    user: state.user,
    session: state.session,
    loading: state.loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    isAuthenticated: !!state.session,
  };
}
