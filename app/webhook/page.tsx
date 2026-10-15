"use client";
import { useState } from "react";
import { Info, Loader2, Webhook } from "lucide-react";
import { ApiError, sendWebhook } from "@/lib/api";
import { prettyJson, formatTime } from "@/lib/format";
import { CodeBlock, EmptyState, PageHeader, Pill } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { WebhookAck } from "@/lib/types";

const SAMPLE = { order_id: 1042, customer: "ada@example.com", total: 59.9, paid: true, items: ["keyboard", "cable"], note: null };

export default function WebhookPage() {
  const toast = useToast();
  const [type, setType] = useState("order.created");
  const [text, setText] = useState(prettyJson(SAMPLE));
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<WebhookAck[]>([]); // current session only: cleared on reload

  async function send() {
    let payload: unknown;
    try { payload = JSON.parse(text || "{}"); } catch (e) { toast(`Payload is not valid JSON: ${(e as Error).message}`, "error"); return; }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) { toast("The payload must be a JSON object.", "error"); return; }
    setLoading(true);
    try {
      const ack = await sendWebhook(type.trim(), payload as Record<string, unknown>);
      setEvents((s) => [ack, ...s].slice(0, 20));
      toast(`Event ${ack.event_id} acknowledged.`);
    } catch (e) { toast(e instanceof ApiError ? e.message : "Webhook test failed.", "error"); }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="Webhook tester">Send a sample event to the Python endpoint <code className="font-mono">POST /api/webhook-test</code> and see the acknowledgement it returns.</PageHeader>
      <div className="card mb-4 flex gap-3 border-indigo-200 bg-indigo-50 p-4 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p>This is a demonstration. Events are acknowledged and summarised, then discarded: nothing is stored on the server, and there is no public inbox or guaranteed delivery. A <code className="font-mono">localhost</code> URL is reachable only from your own computer, so outside services cannot send events to it while you develop locally.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <div><label htmlFor="etype" className="label">Event type</label><input id="etype" className="input font-mono" value={type} onChange={(e) => setType(e.target.value)} /></div>
          <div><label htmlFor="payload" className="label">Payload (JSON object)</label><textarea id="payload" rows={11} spellCheck={false} className="input font-mono" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <button className="btn-primary" onClick={send} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}Send sample event</button>
        </section>
        <section aria-label="Event viewer" aria-live="polite">
          <h2 className="mb-2 font-medium text-slate-900">Events this session</h2>
          {events.length === 0 ? <EmptyState icon={<Webhook className="h-8 w-8" />} title="No events sent">Acknowledgements appear here until you reload the page.</EmptyState> : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.event_id} className="card space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Pill tone="good">{e.status}</Pill><code className="font-mono">{e.event_type}</code><span className="ml-auto text-xs text-slate-500">{formatTime(e.received_at)}</span></div>
                  <p className="text-slate-600">{e.event_id} · {e.payload_summary.key_count} keys · {e.payload_summary.size_bytes} bytes</p>
                  <CodeBlock label="Acknowledgement" text={prettyJson(e)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
