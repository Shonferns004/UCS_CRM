// Reuse the application-wide Supabase client so auth storage and realtime
// channels are not initialized twice in the same browser tab.
export { supabase } from '../../../config/supabase'
