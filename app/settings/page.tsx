"use client";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/Workspace";
import { MAX_HISTORY } from "@/lib/storage";

const Item = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div><h3 className="font-medium text-slate-900">{t}</h3><div className="mt-1 text-sm text-slate-600">{children}</div></div>
);

export default function SettingsPage() {
  const { clearEverything, history, configs } = useWorkspace();
  return (
    <>
      <PageHeader title="Settings & help">How PulseCheck stores data, what it blocks, and its limits.</PageHeader>
      <div className="space-y-4">
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Your data</h2>
          <Item t="Stored in this browser only">Request history (up to {MAX_HISTORY} entries, bodies trimmed to 20,000 characters) and saved configurations live in localStorage. They are not synchronized across devices or browsers, and clearing site data removes them.</Item>
          <Item t="Credentials are never saved">Bearer tokens, API keys and sensitive header or query values exist only in memory for one send. Reopened or rerun requests need credentials re-entered.</Item>
          <div className="flex items-center gap-3">
            <button className="btn-danger" onClick={() => { if (confirm("Delete all history and saved configurations?")) clearEverything(); }}><Trash2 className="h-4 w-4" />Delete all saved data</button>
            <span className="hint">{history.length} history entries, {configs.length} configurations</span>
          </div>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Server protections</h2>
          <Item t="Blocked destinations">Only http and https. Localhost, private, loopback, link-local, multicast and reserved addresses, and cloud metadata endpoints are refused. Host names are resolved and every address is checked, including on each redirect.</Item>
          <Item t="Limits">Timeout 1–25 s, at most 3 redirects, responses cut off at 1 MB, request bodies up to 100 KB, and a per-instance rate limit.</Item>
          <Item t="Allowlist">The server operator can restrict outbound hosts with the PULSECHECK_ALLOWED_HOSTS environment variable. See the README.</Item>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Tips</h2>
          <Item t="404 and 500 are valid answers">The server responded, so PulseCheck shows the response. “Failed request” in the dashboard counts these plus timeouts and connection errors.</Item>
          <Item t="Try it">GET https://jsonplaceholder.typicode.com/todos/1, then validate that <code className="font-mono">id</code> is a number and <code className="font-mono">title</code> is a string.</Item>
        </section>
      </div>
    </>
  );
}
