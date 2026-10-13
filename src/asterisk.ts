import type { Env } from "./types";

// ── Asterisk ARI client ───────────────────────────────────────

function ariFetch(env: Env, path: string, init: RequestInit = {}) {
  const auth = btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${auth}`);
  return fetch(`${env.ASTERISK_URL}/ari/${path}`, { ...init, headers });
}

/** Raw audio of a stored recording (/var/spool/asterisk/recording/<name>.*). */
export function ariRecordingFile(env: Env, name: string) {
  return ariFetch(env, `recordings/stored/${encodeURIComponent(name)}/file`);
}

/** Runs [greetings-sync] on the Asterisk box (greetings-sync.sh), which pulls
 *  the voicemail settings from /voicemail/sync. The Local channel's other end
 *  never answers; it only exists to get the dialplan run. */
export function ariSyncGreetings(env: Env) {
  return ariFetch(env, "channels?endpoint=Local/s@greetings-sync&context=greetings-sync&extension=noop&priority=1&timeout=30", { method: "POST" });
}

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
