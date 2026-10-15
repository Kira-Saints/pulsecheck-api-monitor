"use client";
import { useState } from "react";
import { Bookmark, Loader2, Send, Trash2 } from "lucide-react";
import { PageHeader, KeyValueEditor } from "@/components/ui";
import { ResponseInspector } from "@/components/ResponseInspector";
import { useWorkspace } from "@/components/Workspace";
import { isSensitiveHeader, isSensitiveQuery } from "@/lib/redact";
import { METHODS, type Method } from "@/lib/types";

export default function RequestPage() {
  const { form, setForm, send, loading, configs, saveConfig, loadConfig, deleteConfig } = useWorkspace();
  const [name, setName] = useState("");
  const set = (p: Partial<typeof form>) => setForm({ ...form, ...p });
  const setAuth = (p: Partial<typeof form.auth>) => setForm({ ...form, auth: { ...form.auth, ...p } });
  const canBody = form.method !== "GET";

  return (
    <>
      <PageHeader title="Request builder">Send a request to a public API from the server. Private, local and cloud-metadata addresses are blocked. Credentials are used for one call and never saved.</PageHeader>
      <form className="card space-y-5 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-32">
            <label htmlFor="method" className="label">Method</label>
            <select id="method" className="input font-semibold" value={form.method} onChange={(e) => set({ method: e.target.value as Method })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div className="flex-1">
            <label htmlFor="url" className="label">URL</label>
            <input id="url" className="input font-mono" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://api.example.com/items" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          </div>
          <div className="sm:self-end">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{loading ? "Sending" : "Send request"}</button>
          </div>
        </div>

        <fieldset><legend className="label">Query parameters</legend>
          <KeyValueEditor noun="parameter" rows={form.query} onChange={(query) => set({ query })} secretNames={isSensitiveQuery} /></fieldset>
        <fieldset><legend className="label">Headers</legend>
          <KeyValueEditor noun="header" rows={form.headers} onChange={(headers) => set({ headers })} secretNames={isSensitiveHeader} />
          <p className="hint mt-1">Sensitive header values are not saved to history.</p></fieldset>

        <fieldset className="space-y-3"><legend className="label">Authentication</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {([["none", "None"], ["bearer", "Bearer token"], ["api_key", "API key"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name="auth" checked={form.auth.type === v} onChange={() => setAuth({ type: v })} />{l}</label>
            ))}
          </div>
          {form.auth.type === "bearer" && (
            <div><label htmlFor="token" className="label">Token</label>
              <input id="token" type="password" autoComplete="off" className="input font-mono" value={form.auth.token} onChange={(e) => setAuth({ token: e.target.value })} /></div>
          )}
          {form.auth.type === "api_key" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div><label htmlFor="akn" className="label">Name</label><input id="akn" className="input font-mono" value={form.auth.apiKeyName} onChange={(e) => setAuth({ apiKeyName: e.target.value })} /></div>
              <div><label htmlFor="akv" className="label">Value</label><input id="akv" type="password" autoComplete="off" className="input font-mono" value={form.auth.apiKeyValue} onChange={(e) => setAuth({ apiKeyValue: e.target.value })} /></div>
              <div><label htmlFor="akl" className="label">Send in</label>
                <select id="akl" className="input" value={form.auth.apiKeyLocation} onChange={(e) => setAuth({ apiKeyLocation: e.target.value as "header" | "query" })}><option value="header">Header</option><option value="query">Query string</option></select></div>
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="body" className="label">JSON body</label>
          <textarea id="body" rows={6} disabled={!canBody} spellCheck={false} className="input font-mono" placeholder={canBody ? '{ "name": "example" }' : "GET requests do not have a body."} value={form.bodyText} onChange={(e) => set({ bodyText: e.target.value })} />
        </div>

        <div className="max-w-xs">
          <label htmlFor="timeout" className="label">Timeout: {form.timeoutSeconds} s</label>
          <input id="timeout" type="range" min={1} max={25} step={1} className="w-full" value={form.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} />
          <p className="hint">Between 1 and 25 seconds.</p>
        </div>
      </form>

      <section className="card mt-4 p-4" aria-labelledby="cfg-h">
        <h2 id="cfg-h" className="font-medium text-slate-900">Saved configurations</h2>
        <div className="mt-2 flex gap-2">
          <input className="input" aria-label="Configuration name" placeholder="Name this request setup" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-secondary shrink-0" onClick={() => { saveConfig(name); setName(""); }}><Bookmark className="h-4 w-4" />Save</button>
        </div>
        {configs.length === 0 ? <p className="hint mt-2">Nothing saved yet. Configurations are kept in this browser without credentials.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {configs.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <span className="font-medium">{c.name}</span><span className="truncate font-mono text-xs text-slate-500">{c.request.method} {c.request.url}</span>
                <button className="btn-secondary ml-auto px-2.5 py-1 text-xs" onClick={() => loadConfig(c)}>Load</button>
                <button className="btn-danger px-2.5 py-1" aria-label={`Delete ${c.name}`} onClick={() => deleteConfig(c.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Response</h2>
      <ResponseInspector />
    </>
  );
}
