-- Wrong passwords at /auth/login (src/users.ts handleLogin): too many for
-- one extension, or from one IP address, in 15 minutes locks sign-in there.
CREATE TABLE IF NOT EXISTS login_failures (
  ext TEXT NOT NULL,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_failures_ext ON login_failures(ext, at);
CREATE INDEX IF NOT EXISTS idx_login_failures_ip ON login_failures(ip, at);
