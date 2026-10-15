import type { HistoryEntry, RequestForm } from "./types";

const SENSITIVE_HEADERS = new Set([
  "authorization", "proxy-authorization", "x-api-key", "api-key", "apikey",
  "x-auth-token", "x-access-token", "x-token", "cookie",
]);
const SENSITIVE_QUERY = new Set([
  "api_key", "apikey", "key", "token", "access_token", "auth", "authorization",
  "secret", "password", "client_secret", "signature", "sig",
]);

export const isSensitiveHeader = (name: string) => SENSITIVE_HEADERS.has(name.trim().toLowerCase());
export const isSensitiveQuery = (name: string) => SENSITIVE_QUERY.has(name.trim().toLowerCase());

/** Blank out sensitive query values inside a URL string (e.g. ?api_key=abc). */
export function redactUrl(url: string): string {
  const i = url.indexOf("?");
  if (i < 0) return url;
  const hash = url.indexOf("#", i);
  const qs = url.slice(i + 1, hash < 0 ? undefined : hash);
  const out = qs.split("&").map((pair) => {
    const [k] = pair.split("=");
    let name = k;
    try { name = decodeURIComponent(k); } catch { /* keep raw */ }
    return isSensitiveQuery(name) ? `${k}=` : pair;
  });
  return url.slice(0, i + 1) + out.join("&") + (hash < 0 ? "" : url.slice(hash));
}

/** A copy of the form that is safe to put in localStorage: no credentials at all. */
export function stripSecrets(f: RequestForm): RequestForm {
  return {
    ...f,
    url: redactUrl(f.url),
    query: f.query.map((q) => (isSensitiveQuery(q.key) ? { ...q, value: "" } : q)),
    headers: f.headers.map((h) => (isSensitiveHeader(h.key) ? { ...h, value: "" } : h)),
    auth: { ...f.auth, token: "", apiKeyValue: "" },
  };
}

export const requestUsesSecrets = (f: RequestForm) =>
  f.auth.type !== "none" ||
  f.headers.some((h) => isSensitiveHeader(h.key) && h.value) ||
  f.query.some((q) => isSensitiveQuery(q.key) && q.value) ||
  redactUrl(f.url) !== f.url;

export const MAX_BODY_CHARS = 20_000;
export function trimEntry(e: HistoryEntry): HistoryEntry {
  if (!e.result) return e;
  const r = e.result;
  const big = r.body_text.length > MAX_BODY_CHARS;
  return {
    ...e,
    result: {
      ...r,
      body_text: big ? r.body_text.slice(0, MAX_BODY_CHARS) : r.body_text,
      body_json: big ? null : r.body_json,
      truncated: r.truncated || big,
      is_json: big ? false : r.is_json,
    },
  };
}
