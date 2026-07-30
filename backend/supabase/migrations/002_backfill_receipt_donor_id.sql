    -- Backfill donor_id for receipts created via verifyLead/generateReceipt
    -- Before the code fix, these receipts had donor_id = NULL even though
    -- the donor_profiles.total_amount and donation_count were updated.

    UPDATE public.receipts r
    SET donor_id = l.donor_id
    FROM public.fro_donor_logs l
    WHERE r.log_id = l.id
      AND r.donor_id IS NULL
      AND l.donor_id IS NOT NULL;

