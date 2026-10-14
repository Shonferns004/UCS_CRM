-- Images (4–6) attached to an event, so the "Event Detail Sheet" the Social head
-- downloads when creating an event from a finished programme can be re-issued
-- later — on any device, after a refresh — with the same photos.
--
-- Stored as a JSON array of data-URLs (the client already turns each picked file
-- into a data-URL for the PDF, so no separate upload service is needed). Kept
-- NULL/empty for events that have none.
ALTER TABLE event_head_events
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
