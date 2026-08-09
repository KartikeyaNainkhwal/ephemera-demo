-- Team invites, phase 1.

-- Every invite belongs to a workspace.
ALTER TABLE tasks ADD COLUMN workspace_id integer NOT NULL;

-- Invites are looked up by token on every accept.
CREATE INDEX idx_tasks_workspace ON tasks (workspace_id);

-- Tighten the existing column now that the app always sets it.
ALTER TABLE tasks ALTER COLUMN text SET NOT NULL;
