import type { Env } from "./types";

// ── Asterisk ARI client ───────────────────────────────────────

export async function ariRequest(env: Env, path: string, method = "GET", body?: Record<string, unknown>) {
  const url = `${env.ASTERISK_URL}/ari/${path}`;
  const auth = btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}
