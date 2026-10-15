"use client";
import { useRouter } from "next/navigation";
import { Eye, History as HistoryIcon, RotateCw, Trash2 } from "lucide-react";
import { EmptyState, MethodTag, PageHeader, Pill, StatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/Workspace";
import { formatTime, hostOf } from "@/lib/format";
import { MAX_HISTORY } from "@/lib/storage";

export default function HistoryPage() {
  const { history, hydrated, reopen, rerun, deleteEntry, clearHistory } = useWorkspace();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Request history">
        The last {MAX_HISTORY} requests, saved in this browser only. History is not synchronized across devices or browsers, and credentials are never stored.
      </PageHeader>
      {!hydrated ? null : history.length === 0 ? (
        <EmptyState icon={<HistoryIcon className="h-8 w-8" />} title="No history yet">Requests you send from the request builder appear here.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex justify-end"><button className="btn-danger" onClick={() => { if (confirm("Delete all history from this browser?")) clearHistory(); }}><Trash2 className="h-4 w-4" />Clear all</button></div>
          <ul className="card divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <MethodTag method={h.request.method} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-slate-900" title={h.request.url}>{hostOf(h.request.url)}{(() => { try { return new URL(h.request.url).pathname; } catch { return ""; } })()}</p>
                    <p className="text-xs text-slate-500">{formatTime(h.timestamp)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge code={h.result?.status_code ?? null} />
                  {h.result ? <span className="text-xs text-slate-600">{h.result.elapsed_ms} ms</span> : null}
                  <Pill tone={h.result ? (h.result.http_ok ? "good" : "bad") : "bad"}>{h.result ? (h.result.http_ok ? "Success" : "HTTP error") : "Failed"}</Pill>
                  {h.validation && <Pill tone={h.validation.valid ? "good" : "warn"}>JSON {h.validation.valid ? "valid" : "invalid"}</Pill>}
                </div>
                <div className="flex gap-1.5">
                  <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => { reopen(h); router.push("/inspector"); }}><Eye className="h-3.5 w-3.5" />Open</button>
                  <button className="btn-secondary px-2.5 py-1 text-xs" onClick={async () => { const sent = await rerun(h); router.push(sent ? "/inspector" : "/request"); }}><RotateCw className="h-3.5 w-3.5" />Rerun</button>
                  <button className="btn-danger px-2.5 py-1" aria-label="Delete this record" onClick={() => deleteEntry(h.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
