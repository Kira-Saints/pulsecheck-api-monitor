"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Gauge, Send, XCircle } from "lucide-react";
import { EmptyState, MethodTag, PageHeader, StatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/Workspace";
import { checkHealth } from "@/lib/api";
import { formatTime, hostOf } from "@/lib/format";

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">{icon}{label}</div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="hint mt-0.5">{note}</p>
    </div>
  );
}

export default function Dashboard() {
  const { history, hydrated, reopen } = useWorkspace();
  const [api, setApi] = useState<boolean | null>(null);
  useEffect(() => { checkHealth().then(setApi); }, []);

  const total = history.length;
  const answered = history.filter((h) => h.result);
  const success = answered.filter((h) => h.result!.http_ok).length;
  const failed = total - success; // HTTP 4xx/5xx plus requests with no response
  const avg = answered.length ? Math.round(answered.reduce((s, h) => s + h.result!.elapsed_ms, 0) / answered.length) : 0;
  const validated = history.filter((h) => h.validation);
  const validOk = validated.filter((h) => h.validation!.valid).length;

  return (
    <>
      <PageHeader title="Overview">Statistics come from the requests saved in this browser. They are not shared and not synced.</PageHeader>
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-600" role="status">
        <span className={`h-2 w-2 rounded-full ${api === null ? "bg-slate-300" : api ? "bg-emerald-500" : "bg-red-500"}`} />
        {api === null ? "Checking the Python API…" : api ? "Python API is reachable." : "Python API is not reachable. Locally, start it with npm run api."}
      </div>
      {!hydrated ? null : total === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} title="No requests yet">
          Send your first request to start building statistics. <Link href="/request" className="text-indigo-700 underline">Open the request builder</Link>.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Send className="h-4 w-4" />} label="Total requests" value={String(total)} note="Saved in this browser" />
            <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="HTTP successes" value={String(success)} note="Final status 200–299" />
            <Stat icon={<XCircle className="h-4 w-4 text-red-600" />} label="Failed requests" value={String(failed)} note="HTTP 3xx–5xx, timeouts and errors" />
            <Stat icon={<Gauge className="h-4 w-4" />} label="Average response time" value={`${avg} ms`} note="Requests that got a response" />
          </div>
          <p className="hint mt-3">
            HTTP success means the server returned a 2xx status. JSON validation is separate: {validated.length ? `${validOk} of ${validated.length} validated responses passed their field checks.` : "no responses have been validated yet."}
          </p>
          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Recent requests</h2>
          <ul className="card divide-y divide-slate-100">
            {history.slice(0, 5).map((h) => (
              <li key={h.id}>
                <Link href="/inspector" onClick={() => reopen(h)} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                  <MethodTag method={h.request.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{hostOf(h.request.url)}</span>
                  <StatusBadge code={h.result?.status_code ?? null} />
                  <span className="hidden text-xs text-slate-500 sm:inline">{formatTime(h.timestamp)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
