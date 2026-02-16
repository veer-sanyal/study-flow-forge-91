-- Force PostgREST to reload its schema cache after column drops
NOTIFY pgrst, 'reload schema';
