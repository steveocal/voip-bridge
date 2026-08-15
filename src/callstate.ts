// ── Durable Object: CallState ──────────────────────────────────

export class CallState {
  private calls = new Map<string, CallRecord>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/create") {
      const { callId, caller, did, partnerId, partnerName } = await request.json() as CallCreate;
      this.calls.set(callId, { id: callId, caller, did, status: "ringing", startTime: Date.now(), partnerId, partnerName });
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/update") {
      const { callId, ...fields } = await request.json() as { callId: string } & Partial<CallRecord>;
      const call = this.calls.get(callId);
      if (call) Object.assign(call, fields);
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const callId = url.searchParams.get("callId");
      return Response.json(callId ? (this.calls.get(callId) ?? null) : null);
    }

    if (request.method === "GET" && url.pathname === "/active") {
      const now = Date.now();
      const active = [...this.calls.values()].filter(c => {
        // Auto-expire ringing calls older than 5 minutes
        if (c.status === "ringing" && (now - c.startTime) > 300000) {
          c.status = "hungup";
          c.endTime = now;
        }
        return c.status !== "hungup";
      });
      return Response.json(active);
    }

    return new Response("Not found", { status: 404 });
  }
}

export interface CallCreate {
  callId: string;
  caller: string;
  did: string;
  partnerId?: number;
  partnerName?: string;
}

export interface CallRecord {
  id: string;
  caller: string;
  did: string;
  status: "ringing" | "answered" | "hungup";
  partnerId?: number;
  partnerName?: string;
  startTime: number;
  answerTime?: number;
  endTime?: number;
}
