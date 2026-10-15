export const prettyJson = (v: unknown) => JSON.stringify(v, null, 2);

export function statusTone(code: number | null | undefined): "success" | "redirect" | "client" | "server" | "none" {
  if (!code) return "none";
  if (code < 300) return "success";
  if (code < 400) return "redirect";
  if (code < 500) return "client";
  return "server";
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

export function hostOf(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

/** Parse the body editor. Returns {ok:true, value: undefined} for an empty body. */
export function parseBody(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!text.trim()) return { ok: true, value: undefined };
  try { return { ok: true, value: JSON.parse(text) }; }
  catch (e) { return { ok: false, message: `Request body is not valid JSON: ${(e as Error).message}` }; }
}

export function validateUrlClient(url: string): string | null {
  const u = url.trim();
  if (!u) return "Enter a URL.";
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return "Only http:// and https:// URLs are supported.";
    return null;
  } catch { return "Enter a full URL, for example https://api.example.com/items."; }
}
