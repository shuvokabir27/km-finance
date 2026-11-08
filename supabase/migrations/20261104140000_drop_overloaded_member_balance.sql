-- Drop the overloaded 1-parameter member_balance function to resolve PostgREST ambiguity (PGRST203)
DROP FUNCTION IF EXISTS public.member_balance(uuid);

