// ── Minimal Workers Runtime Types ────────────────────────────
// These are always available in the Workers runtime as ambient globals.
// Declared here for TypeScript checking without @cloudflare/workers-types.

declare class DurableObjectState {
  readonly id: DurableObjectId;
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

declare class DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

declare class DurableObjectStub {
  readonly id: DurableObjectId;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

declare class DurableObjectNamespace {
  newUniqueId(options?: { jurisdiction?: string }): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare class DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(): Promise<Map<string, unknown>>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

declare class D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1Result>;
}

declare class D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface Env {
  CALL_STATE: DurableObjectNamespace;
  DB: D1Database;
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USER: string;
  ODOO_PASS: string;
  ASTERISK_URL: string;
  ASTERISK_USER: string;
  ASTERISK_PASS: string;
}
