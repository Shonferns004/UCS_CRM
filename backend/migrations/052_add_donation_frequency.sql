ALTER TABLE donor_profiles ADD COLUMN IF NOT EXISTS donation_frequency VARCHAR(50) DEFAULT NULL;
COMMENT ON COLUMN donor_profiles.donation_frequency IS 'monthly, quarterly, yearly, one_time';
