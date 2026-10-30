import { useEffect, useRef } from 'react';
import { onDbChange } from '../lib/socket';

export function parseFilter(filter) {
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
  { filter, event = '*', onInsert, onUpdate, onDelete, enabled = true, related = null }
) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  // `related` is an array literal at most call sites, so key the effect on a
  // stable string instead of the array identity (which changes every render).
  const relatedKey = related ? related.join(',') : '';

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = onDbChange({
      table,
      event,
      related: relatedKey ? relatedKey.split(',') : null,
      filter: parseFilter(filter),
      onInsert: (row, payload) => onInsertRef.current?.(row, payload),
      onUpdate: (row, old, payload) => onUpdateRef.current?.(row, old, payload),
      onDelete: (old, payload) => onDeleteRef.current?.(old, payload),
    });

    return unsubscribe;
  }, [table, filter, event, enabled, relatedKey]);
}
