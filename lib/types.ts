export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export interface KeyValue { key: string; value: string }

export type AuthType = "none" | "bearer" | "api_key";
export interface AuthForm {
  type: AuthType;
  token: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyLocation: "header" | "query";
}

/** Everything the builder edits. Secrets live only in React state, never in storage. */
export interface RequestForm {
  method: Method;
  url: string;
  query: KeyValue[];
  headers: KeyValue[];
  bodyText: string;
  auth: AuthForm;
  timeoutSeconds: number;
}

export interface ApiResult {
  http_ok: boolean;
  status_code: number;
  reason: string;
  elapsed_ms: number;
  content_type: string | null;
  headers: Record<string, string>;
  body_text: string;
  body_json: unknown;
  is_json: boolean;
  json_error: string | null;
  truncated: boolean;
  size_bytes: number;
  final_url: string;
  redirects: { status_code: number; from_url: string; to_url: string }[];
}

export type JsonType = "string" | "number" | "boolean" | "object" | "array" | "null";
export const JSON_TYPES: JsonType[] = ["string", "number", "boolean", "object", "array", "null"];
export interface Expectation { path: string; type: JsonType }
export interface FieldCheck { path: string; expected: string; actual: string | null; status: "ok" | "missing" | "type_mismatch" }
export interface ValidationResult { valid: boolean; passed: number; missing: number; mismatched: number; fields: FieldCheck[] }

export interface WebhookAck {
  status: "acknowledged";
  event_id: string;
  event_type: string;
  received_at: string;
  payload_summary: { key_count: number; keys: string[]; size_bytes: number; value_types: Record<string, string> };
}

/** Outcome of one send: an HTTP response (even 404/500) or a failure before/without one. */
export interface HistoryEntry {
  id: string;
  timestamp: string;
  request: RequestForm; // credentials stripped before saving
  result: ApiResult | null;
  error: { code: string; message: string } | null;
  validation: ValidationResult | null;
  hadAuth: boolean;
}

export interface SavedConfig { id: string; name: string; request: RequestForm }

export const emptyForm = (): RequestForm => ({
  method: "GET",
  url: "https://jsonplaceholder.typicode.com/todos/1",
  query: [],
  headers: [],
  bodyText: "",
  auth: { type: "none", token: "", apiKeyName: "X-API-Key", apiKeyValue: "", apiKeyLocation: "header" },
  timeoutSeconds: 10,
});
