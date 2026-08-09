-- Billing rollout, phase 1.

-- Every task needs an owner for the new per-user billing.
ALTER TABLE tasks ADD COLUMN owner_email text NOT NULL;

-- Lookups by owner are going to be hot.
CREATE INDEX idx_tasks_owner ON tasks (owner_email);

-- Normalise the existing text while we are here.
UPDATE tasks SET text = trim(text);
