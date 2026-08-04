import { useEffect, useRef } from 'react';
import { onDbChange } from '../lib/socket';

function parseFilter(filter) {
  if (!filter) return () => true
  const match = String(filter).match(/^([A-Za-z_][A-Za-z0-9_]*)=eq\.(.+)$/)
  if (!match) return () => true
  const [, col, val] = match
  return (payload) => {
    const row = payload.new ?? payload.old ?? {}
    return String(row[col]) === String(val)
  }
}

export function useRealtime(
  table,
  { filter, event = '*', onInsert, onUpdate, onDelete, enabled = true }
) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = onDbChange({
      table,
      event,
      filter: parseFilter(filter),
      onInsert: (row) => onInsertRef.current?.(row),
      onUpdate: (row, old) => onUpdateRef.current?.(row, old),
      onDelete: (old) => onDeleteRef.current?.(old),
    });

    return unsubscribe;
  }, [table, filter, event, enabled]);
}
