import type { ApiResult, Expectation, RequestForm, ValidationResult, WebhookAck } from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    throw new ApiError("network", "Could not reach the PulseCheck API. If you are running locally, start it with `npm run api`.", 0);
  }
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.code ?? "http_" + res.status, e?.message ?? `The API returned HTTP ${res.status}.`, res.status);
  }
  return data as T;
}

const clean = (rows: { key: string; value: string }[]) => rows.filter((r) => r.key.trim());

export function toApiPayload(f: RequestForm, body: unknown) {
  const auth =
    f.auth.type === "bearer"
      ? { type: "bearer", token: f.auth.token }
      : f.auth.type === "api_key"
      ? { type: "api_key", api_key_name: f.auth.apiKeyName, api_key_value: f.auth.apiKeyValue, api_key_location: f.auth.apiKeyLocation }
      : { type: "none" };
  return {
    method: f.method,
    url: f.url.trim(),
    query: clean(f.query).map((r) => ({ key: r.key.trim(), value: r.value })),
    headers: clean(f.headers).map((r) => ({ key: r.key.trim(), value: r.value })),
    body,
    auth,
    timeout_seconds: f.timeoutSeconds,
  };
}

export const sendRequest = (f: RequestForm, body: unknown) => post<ApiResult>("/api/request", toApiPayload(f, body));
export const validateJson = (data: unknown, expectations: Expectation[]) =>
  post<ValidationResult>("/api/validate-json", { data, expectations });
export const sendWebhook = (event_type: string, payload: Record<string, unknown>) =>
  post<WebhookAck>("/api/webhook-test", { event_type, payload });
export async function checkHealth(): Promise<boolean> {
  try { return (await fetch("/api/health")).ok; } catch { return false; }
}
