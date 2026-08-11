-- Recruit quiz results table.
-- Stores every candidate's role quiz attempt plus the AI-evaluated marks,
-- percentage and eligibility verdict that show up in the HR "Quizzes" page.
CREATE TABLE IF NOT EXISTS quiz_results (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT,
  surname TEXT,
  age INT,
  dob TEXT,
  role TEXT,
  other_role TEXT,
  role_label TEXT,
  questions JSONB,
  answers JSONB,
  marks NUMERIC,
  max_marks NUMERIC,
  percentage NUMERIC,
  verdict TEXT,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_created_at ON quiz_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_results_role ON quiz_results (role);
