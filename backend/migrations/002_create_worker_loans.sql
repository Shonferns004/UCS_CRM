-- Migration: Create worker_loans and worker_loan_deductions tables
-- Run this in Supabase SQL Editor

DROP TABLE IF EXISTS worker_loan_deductions CASCADE;
DROP TABLE IF EXISTS worker_loans CASCADE;

CREATE TABLE worker_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('advance', 'loan')),
  total_amount DECIMAL(12,2) NOT NULL,
  reason TEXT,
  monthly_deduction DECIMAL(12,2) DEFAULT 0,
  remaining_amount DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'closed')),
  hr_remark TEXT,
  applied_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE worker_loan_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES worker_loans(id) NOT NULL,
  month DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
