-- M2.5 OPS-3: missing_feedback rows are Admin tickets (A08).
-- Status workflow is ops-only; C-side still only POSTs text and never reads progress.

ALTER TABLE missing_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assignee_ops_id UUID REFERENCES ops_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE missing_feedback DROP CONSTRAINT IF EXISTS missing_feedback_status_check;
ALTER TABLE missing_feedback ADD CONSTRAINT missing_feedback_status_check
  CHECK (status IN ('open', 'in_progress', 'done', 'wontfix'));

CREATE INDEX IF NOT EXISTS missing_feedback_status_created_idx
  ON missing_feedback (status, created_at DESC);
