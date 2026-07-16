-- Run in Supabase dashboard SQL editor
-- Step 1: Create agent with password (uses pgcrypto for password hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION create_agent(p_email text, p_password text, p_name text, p_role text DEFAULT 'agent')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_role text;
BEGIN
  v_role := CASE WHEN p_role IN ('admin', 'agent', 'viewer') THEN p_role ELSE 'agent' END;
  
  INSERT INTO public.users (email, name, password_hash, role, is_active)
  VALUES (p_email, p_name, crypt(p_password, gen_salt('bf')), v_role, true)
  RETURNING row_to_json(users) INTO result;
  
  RETURN result;
END;
$$;

-- Step 2: Verify password and return user
CREATE OR REPLACE FUNCTION verify_agent(p_email text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  user_record public.users%ROWTYPE;
BEGIN
  SELECT * INTO user_record FROM public.users WHERE email = p_email;
  
  IF user_record.id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF user_record.password_hash = '' OR user_record.password_hash IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF crypt(p_password, user_record.password_hash) = user_record.password_hash THEN
    SELECT row_to_json(u) INTO result FROM (SELECT id, email, name, role, is_active, created_at FROM public.users WHERE id = user_record.id) u;
    RETURN result;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Step 3: Grant execute
GRANT EXECUTE ON FUNCTION create_agent(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION verify_agent(text, text) TO anon;
