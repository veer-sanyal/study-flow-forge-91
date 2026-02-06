-- Security Hardening Migration
-- 1. Revoke public/authenticated access to maintenance function
-- 2. Add RLS to profiles table

BEGIN;

-- 1. Revoke function permissions
REVOKE EXECUTE ON FUNCTION public.run_daily_fsrs_maintenance FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_daily_fsrs_maintenance FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_fsrs_maintenance FROM anon;

-- Grant only to service_role (and postgres/admin implicitly)
GRANT EXECUTE ON FUNCTION public.run_daily_fsrs_maintenance TO service_role;

-- 2. Secure profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own profile
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
CREATE POLICY "Users can see own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Authenticated users can read valid profiles ?
-- Lovable error says "Exposed to Anonymous".
-- Adding "Public profiles are viewable by everyone" might re-expose it.
-- Let's restrict to authenticated users only if needed, OR just own profile.
-- "Users can see all profiles"
DROP POLICY IF EXISTS "Authenticated users can see all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can see all profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
  
-- The "Authenticated users can see all" supersedes "Users can see own" for SELECT.
-- The goal is to BLOCK anonymous. This does that.

COMMIT;
