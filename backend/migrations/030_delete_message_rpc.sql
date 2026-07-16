CREATE OR REPLACE FUNCTION delete_message(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.messages WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_message(uuid) TO anon;
