CREATE OR REPLACE FUNCTION get_station_disposition_stats(
  p_ngo_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(station text, status text, count bigint)
LANGUAGE sql
AS $$
  SELECT fa.station, fa.status, COUNT(*)::bigint
  FROM fro_assignments fa
  WHERE fa.ngo_id = p_ngo_id
    AND fa.station IS NOT NULL
    AND fa.status != 'reassigned'
    AND (p_from IS NULL OR fa.assigned_at >= p_from)
    AND (p_to IS NULL OR fa.assigned_at <= p_to)
  GROUP BY fa.station, fa.status
  ORDER BY fa.station, fa.status;
$$;
