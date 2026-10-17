-- Wrong-PIN attempts for staff sign-in (src/staff.ts), to lock an employee's
-- sign-in after 5 failures in 15 minutes.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0010_staff_login.sql
CREATE TABLE IF NOT EXISTS staff_login_failures (
  employee_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_login_failures ON staff_login_failures(employee_id, at);
