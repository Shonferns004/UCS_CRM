import { useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';

export function useRealtime(
  table,
  { filter, event = '*', onInsert, onUpdate, onDelete, enabled = true }
) {
  const channelRef = useRef(null);
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  useEffect(() => {
    if (!enabled) return;

    let channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        (payload) => {
          if (payload.eventType === 'INSERT' && onInsertRef.current) onInsertRef.current(payload.new);
          if (payload.eventType === 'UPDATE' && onUpdateRef.current) onUpdateRef.current(payload.new, payload.old);
          if (payload.eventType === 'DELETE' && onDeleteRef.current) onDeleteRef.current(payload.old);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled]);
}
