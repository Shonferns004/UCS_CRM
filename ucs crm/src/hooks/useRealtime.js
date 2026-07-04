import { useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';

export function useRealtime(
  table,
  { filter, event = '*', onInsert, onUpdate, onDelete, enabled = true }
) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    let channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        (payload) => {
          if (payload.eventType === 'INSERT' && onInsert) onInsert(payload.new);
          if (payload.eventType === 'UPDATE' && onUpdate) onUpdate(payload.new, payload.old);
          if (payload.eventType === 'DELETE' && onDelete) onDelete(payload.old);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled]);
}
