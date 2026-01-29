# Authentication Skill

This skill guides authentication patterns and route protection for Study Flow Forge.

---

## Overview

Authentication uses Supabase Auth with:
- Email/password authentication
- Google OAuth
- Session persistence in localStorage
- Automatic token refresh

---

## Auth Hook Pattern

The `useAuth` hook (`src/hooks/use-auth.ts`) is the primary interface:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // IMPORTANT: Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ... auth methods

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    isAuthenticated: !!session,
  };
}
```

### Key Pattern: Listener-First
```typescript
// CORRECT: Listener first, then check session
useEffect(() => {
  // 1. Set up listener
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...);

  // 2. Then check existing session
  supabase.auth.getSession().then(...);

  return () => subscription.unsubscribe();
}, []);

// WRONG: Checking session without listener
useEffect(() => {
  supabase.auth.getSession().then(...);
  // Missing listener = won't update on auth changes
}, []);
```

---

## Sign Up Pattern

```typescript
const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
  const redirectUrl = `${window.location.origin}/`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: fullName,  // Stored in raw_user_meta_data
      },
    },
  });

  return { error };
}, []);
```

### Email Confirmation Flow
1. User submits signup form
2. Supabase sends confirmation email
3. User clicks link → redirected to `emailRedirectTo` URL
4. Session is established

---

## Sign In Pattern

### Email/Password
```typescript
const signIn = useCallback(async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { error };
}, []);
```

### Error Handling
```typescript
const { error } = await signIn(email, password);

if (error) {
  if (error.message.includes('Invalid login credentials')) {
    toast({
      title: 'Invalid credentials',
      description: 'Please check your email and password.',
      variant: 'destructive',
    });
  } else if (error.message.includes('Email not confirmed')) {
    toast({
      title: 'Email not confirmed',
      description: 'Please check your inbox for the confirmation link.',
      variant: 'destructive',
    });
  } else {
    toast({
      title: 'Sign in failed',
      description: error.message,
      variant: 'destructive',
    });
  }
}
```

---

## OAuth Pattern (Google)

```typescript
const signInWithGoogle = useCallback(async () => {
  const redirectUrl = `${window.location.origin}/`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
    },
  });

  return { error };
}, []);
```

### OAuth Flow
1. User clicks "Sign in with Google"
2. Redirected to Google consent screen
3. After consent, redirected back to `redirectTo` URL
4. Supabase exchanges code for session
5. `onAuthStateChange` fires with new session

### Handling OAuth Redirect
```typescript
// In App.tsx or route handler
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // User just signed in via OAuth
        navigate('/study');
      }
    }
  );

  return () => subscription.unsubscribe();
}, [navigate]);
```

---

## Sign Out Pattern

```typescript
const signOut = useCallback(async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
}, []);

// Usage with redirect
const handleSignOut = async () => {
  await signOut();
  navigate('/auth');
};
```

---

## ProtectedRoute Component

Protects routes that require authentication:

```typescript
// src/components/layout/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
```

### Route Setup
```typescript
// In App.tsx
<Routes>
  <Route path="/auth" element={<AuthPage />} />

  {/* Protected routes */}
  <Route element={<ProtectedRoute />}>
    <Route element={<AppLayout />}>
      <Route path="/study" element={<StudyPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
  </Route>
</Routes>
```

---

## AdminRoute with Role Check

Protects admin-only routes:

```typescript
// src/components/layout/AdminRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { Skeleton } from '@/components/ui/skeleton';

export function AdminRoute() {
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-md p-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/study" replace />;
  }

  return <Outlet />;
}
```

### useIsAdmin Hook
```typescript
// src/hooks/use-is-admin.ts
export function useIsAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user) return false;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('[useIsAdmin] Error:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
```

### Route Setup
```typescript
<Route element={<ProtectedRoute />}>
  <Route element={<AppLayout />}>
    {/* User routes */}
    <Route path="/study" element={<StudyPage />} />

    {/* Admin routes */}
    <Route element={<AdminRoute />}>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/ingestion" element={<IngestionPage />} />
    </Route>
  </Route>
</Route>
```

---

## Session Handling

### Storage Configuration
```typescript
// src/integrations/supabase/client.ts
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,      // Persist session
      persistSession: true,       // Keep session across page reloads
      autoRefreshToken: true,     // Auto-refresh before expiry
    },
  }
);
```

### Session Structure
```typescript
interface Session {
  access_token: string;      // JWT for API calls
  refresh_token: string;     // Used to get new access token
  expires_in: number;        // Seconds until expiry
  expires_at: number;        // Unix timestamp
  user: User;               // User object
}
```

### Token Refresh
Supabase handles token refresh automatically:
- Checks token validity before API calls
- Refreshes if close to expiry
- Updates session in storage

### Manual Session Check
```typescript
const { data: { session }, error } = await supabase.auth.getSession();

if (!session) {
  // No valid session
  navigate('/auth');
}
```

---

## Auth State Events

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'INITIAL_SESSION':
      // Initial session check on mount
      break;
    case 'SIGNED_IN':
      // User just signed in
      break;
    case 'SIGNED_OUT':
      // User signed out
      break;
    case 'TOKEN_REFRESHED':
      // Token was refreshed
      break;
    case 'USER_UPDATED':
      // User metadata updated
      break;
    case 'PASSWORD_RECOVERY':
      // Password recovery flow
      break;
  }
});
```

---

## Anti-Patterns

### Never store tokens manually
```typescript
// Bad
localStorage.setItem('token', session.access_token);

// Good - Supabase handles storage
// Just use the client
```

### Never skip loading state
```typescript
// Bad
if (!isAuthenticated) {
  return <Navigate to="/auth" />;
}
// This redirects during initial load!

// Good
if (loading) {
  return <Loader />;
}
if (!isAuthenticated) {
  return <Navigate to="/auth" />;
}
```

### Never check auth in useEffect only
```typescript
// Bad
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session) navigate('/auth');
  });
}, []);
// Won't respond to auth changes!

// Good
// Use ProtectedRoute component
```

### Never expose service role key
```typescript
// Bad - in client code
const supabase = createClient(url, serviceRoleKey);

// Good - service role only in edge functions
```

---

## Error Messages

User-friendly error handling:

```typescript
const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Email or password is incorrect.',
  'Email not confirmed': 'Please verify your email address.',
  'User already registered': 'An account with this email already exists.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
  'Signups not allowed': 'New registrations are currently disabled.',
};

function getAuthErrorMessage(error: Error): string {
  return AUTH_ERRORS[error.message] ?? 'An unexpected error occurred. Please try again.';
}
```

---

## Security Considerations

1. **Never log sensitive data**
```typescript
// Bad
console.log('Session:', session);

// Good
console.log('[Auth] Session established for user:', user?.id);
```

2. **Always validate on server**
- Client-side auth is for UX only
- Edge functions must verify tokens
- RLS policies enforce data access

3. **Use HTTPS in production**
- Supabase enforces HTTPS
- Ensure `redirectTo` URLs use HTTPS

4. **Set secure cookie options**
- Handled by Supabase configuration
- Check project settings in dashboard
