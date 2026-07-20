    -- Add details_status column to workers table
    -- Values: 'completed' or 'pending', default 'pending'
    ALTER TABLE workers ADD COLUMN IF NOT EXISTS details_status TEXT DEFAULT 'pending';
