-- Run this in Supabase dashboard
CREATE OR REPLACE FUNCTION delete_agent(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_agent(uuid) TO anon;
