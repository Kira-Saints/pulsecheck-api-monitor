"use client";
import { useState, type ReactNode } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { statusTone } from "@/lib/format";
import type { KeyValue } from "@/lib/types";
import { useToast } from "./Toast";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {children && <p className="mt-1 max-w-2xl text-sm text-slate-600">{children}</p>}
    </header>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true); toast("Copied to clipboard."); setTimeout(() => setDone(false), 1500);
    } catch { toast("Copy failed. Select the text and copy it manually.", "error"); }
  }
  return (
    <button type="button" onClick={copy} className="btn-secondary px-2.5 py-1 text-xs" aria-label={`${label} to clipboard`}>
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{label}
    </button>
  );
}

const TONES = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  redirect: "bg-sky-50 text-sky-700 border-sky-200",
  client: "bg-amber-50 text-amber-800 border-amber-200",
  server: "bg-red-50 text-red-700 border-red-200",
  none: "bg-slate-100 text-slate-600 border-slate-200",
};
export function StatusBadge({ code, reason }: { code: number | null; reason?: string }) {
  const tone = statusTone(code);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {code ?? "No response"}{reason ? <span className="font-normal">{reason}</span> : null}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "good" | "bad" | "neutral" | "warn"; children: ReactNode }) {
  const c = { good: TONES.success, bad: TONES.server, neutral: TONES.none, warn: TONES.client }[tone];
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function MethodTag({ method }: { method: string }) {
  return <span className="inline-block w-14 rounded bg-slate-100 px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-slate-700">{method}</span>;
}

export function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium text-slate-700">{label}</span><CopyButton text={text} /></div>
      <pre tabIndex={0} aria-label={label} className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">{text}</pre>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-slate-400">{icon}</div>
      <h2 className="font-medium text-slate-900">{title}</h2>
      {children && <div className="mt-1 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

export function KeyValueEditor({ rows, onChange, noun, secretNames }: { rows: KeyValue[]; onChange: (r: KeyValue[]) => void; noun: string; secretNames?: (k: string) => boolean }) {
  const set = (i: number, patch: Partial<KeyValue>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="hint">No {noun}s yet.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className="input" aria-label={`${noun} name ${i + 1}`} placeholder="Name" value={r.key} onChange={(e) => set(i, { key: e.target.value })} />
          <input className="input" aria-label={`${noun} value ${i + 1}`} placeholder="Value" type={secretNames?.(r.key) ? "password" : "text"} value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" className="btn-secondary px-2.5" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" className="btn-secondary" disabled={rows.length >= 20} onClick={() => onChange([...rows, { key: "", value: "" }])}><Plus className="h-4 w-4" />Add {noun}</button>
    </div>
  );
}
