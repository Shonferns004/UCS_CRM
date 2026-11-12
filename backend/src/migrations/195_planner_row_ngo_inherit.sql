-- Make planner row NGO inherit the page scope by default.
-- A row_ngo_id equal to ngo_id (the page scope) was just the default, not an
-- explicit pick, so it prevented rows from following the selected tab (BSCT/MANN/AFLF).
-- Clear those so the row falls back to the current tab's NGO.
UPDATE event_head_planner_manual_rows
   SET row_ngo_id = ''
 WHERE row_ngo_id = ngo_id
   AND row_ngo_id <> '';
