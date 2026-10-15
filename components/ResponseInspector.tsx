"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Loader2, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { formatBytes, prettyJson } from "@/lib/format";
import { JSON_TYPES, type JsonType } from "@/lib/types";
import { CodeBlock, EmptyState, Pill, StatusBadge } from "./ui";
import { useWorkspace } from "./Workspace";

function Validator() {
  const { result, expectations, setExpectations, validation, validating, runValidation } = useWorkspace();
  const set = (i: number, p: Partial<{ path: string; type: JsonType }>) => setExpectations(expectations.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const icon = { ok: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, missing: <XCircle className="h-4 w-4 text-red-600" />, type_mismatch: <CircleAlert className="h-4 w-4 text-amber-600" /> };
  const label = { ok: "Present, correct type", missing: "Missing", type_mismatch: "Wrong type" };
  return (
    <section className="card p-4" aria-labelledby="validator-h">
      <h3 id="validator-h" className="font-medium text-slate-900">JSON validator</h3>
      <p className="hint mb-3">Check the response body for expected fields. Use dots and indexes for nesting, for example <code className="font-mono">data.items[0].id</code>. Revalidating reuses the response above and does not send the request again.</p>
      {!result?.is_json ? (
        <p className="text-sm text-slate-600">The last response was not JSON, so there is nothing to validate.</p>
      ) : (
        <>
          <div className="space-y-2">
            {expectations.map((e, i) => (
              <div key={i} className="flex gap-2">
                <input className="input font-mono" aria-label={`Field path ${i + 1}`} placeholder="field.path" value={e.path} onChange={(ev) => set(i, { path: ev.target.value })} />
                <select className="input w-32" aria-label={`Expected type ${i + 1}`} value={e.type} onChange={(ev) => set(i, { type: ev.target.value as JsonType })}>
                  {JSON_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <button className="btn-secondary px-2.5" aria-label={`Remove field ${i + 1}`} onClick={() => setExpectations(expectations.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setExpectations([...expectations, { path: "", type: "string" }])} disabled={expectations.length >= 100}><Plus className="h-4 w-4" />Add field</button>
            <button className="btn-primary" onClick={runValidation} disabled={validating}>{validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{validation ? "Revalidate" : "Validate"}</button>
          </div>
          {validation && (
            <div className="mt-4" aria-live="polite">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Pill tone={validation.valid ? "good" : "bad"}>JSON validation {validation.valid ? "passed" : "failed"}</Pill>
                <span className="hint">{validation.passed} ok · {validation.missing} missing · {validation.mismatched} wrong type</span>
              </div>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {validation.fields.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2">{icon[f.status]}
                    <code className="font-mono">{f.path}</code>
                    <span className="ml-auto text-xs text-slate-600">{label[f.status]} · expected {f.expected}{f.actual && f.actual !== f.expected ? `, got ${f.actual}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function ResponseInspector({ showEmptyLink = false }: { showEmptyLink?: boolean }) {
  const { result: r, error, loading } = useWorkspace();
  const [tab, setTab] = useState<"body" | "headers">("body");

  if (loading) return <div className="card flex items-center gap-2 p-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Waiting for the response…</div>;
  if (error) return (
    <div className="card border-red-200 p-4" role="alert">
      <div className="flex items-center gap-2 font-medium text-red-700"><AlertTriangle className="h-4 w-4" />Request failed</div>
      <p className="mt-1 text-sm text-slate-700">{error.message}</p>
      <p className="hint mt-1">Error code: <code>{error.code}</code>. No HTTP response was received, so no status is shown.</p>
    </div>
  );
  if (!r) return (
    <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No response yet">
      Send a request to see its status, timing, headers and body here.{showEmptyLink && <> <Link href="/request" className="text-indigo-700 underline">Open the request builder</Link>.</>}
    </EmptyState>
  );
  const body = r.is_json ? prettyJson(r.body_json) : r.body_text;
  return (
    <div className="space-y-4">
      <section className="card p-4" aria-label="Response summary">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge code={r.status_code} reason={r.reason} />
          <Pill tone={r.http_ok ? "good" : "bad"}>{r.http_ok ? "HTTP success" : "HTTP error"}</Pill>
          <span className="text-sm text-slate-600">{r.elapsed_ms} ms</span>
          <span className="text-sm text-slate-600">{formatBytes(r.size_bytes)}</span>
          <span className="truncate text-sm text-slate-600">{r.content_type ?? "no content type"}</span>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-slate-500">{r.final_url}</p>
        {r.redirects.length > 0 && <p className="hint mt-1">Followed {r.redirects.length} redirect(s): {r.redirects.map((h) => h.status_code).join(" → ")}</p>}
        {r.truncated && <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />The body was cut off at the server size limit.</p>}
        {r.json_error && !r.truncated && <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{r.json_error}</p>}
        <p className="hint mt-2">HTTP status only tells you whether the server answered successfully. Use the validator to check the data inside.</p>
      </section>
      <section className="card p-4">
        <div role="tablist" aria-label="Response parts" className="mb-3 flex gap-1 border-b border-slate-200">
          {(["body", "headers"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              {t === "body" ? (r.is_json ? "JSON body" : "Body") : `Headers (${Object.keys(r.headers).length})`}
            </button>
          ))}
        </div>
        {tab === "body"
          ? (body ? <CodeBlock text={body} label={r.is_json ? "Formatted JSON" : "Plain text"} /> : <p className="text-sm text-slate-600">The response had no body.</p>)
          : <CodeBlock text={Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join("\n")} label="Response headers" />}
      </section>
      <Validator />
    </div>
  );
}
