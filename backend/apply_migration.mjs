import supabase from './src/config/supabase.js';

const sql = `
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('hoadmin', 'hr', 'accounts', 'leads', 'recruiter', 'telecaller', 'team_lead', 'admin', 'agent', 'viewer', 'tenant_admin'));
`;

const { data, error } = await supabase.rpc('exec_sql', { sql });

if (error) {
  console.log('RPC failed:', error.message);
} else {
  console.log('Migration applied successfully:', data);
}
