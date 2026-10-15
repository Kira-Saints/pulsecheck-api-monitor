"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, sendRequest, validateJson } from "@/lib/api";
import { parseBody, validateUrlClient } from "@/lib/format";
import { requestUsesSecrets, stripSecrets } from "@/lib/redact";
import { clearAllStorage, loadConfigs, loadHistory, saveConfigs, saveHistory } from "@/lib/storage";
import { emptyForm, type ApiResult, type Expectation, type HistoryEntry, type RequestForm, type SavedConfig, type ValidationResult } from "@/lib/types";
import { useToast } from "./Toast";

interface Ctx {
  form: RequestForm; setForm: (f: RequestForm) => void;
  result: ApiResult | null; error: { code: string; message: string } | null;
  loading: boolean; send: () => Promise<boolean>;
  expectations: Expectation[]; setExpectations: (e: Expectation[]) => void;
  validation: ValidationResult | null; validating: boolean; runValidation: () => Promise<void>;
  history: HistoryEntry[]; hydrated: boolean;
  reopen: (e: HistoryEntry) => void; rerun: (e: HistoryEntry) => Promise<boolean>;
  deleteEntry: (id: string) => void; clearHistory: () => void; clearEverything: () => void;
  configs: SavedConfig[]; saveConfig: (name: string) => void; loadConfig: (c: SavedConfig) => void; deleteConfig: (id: string) => void;
  hasCurrent: boolean;
}
const WS = createContext<Ctx | null>(null);
export const useWorkspace = () => { const c = useContext(WS); if (!c) throw new Error("WorkspaceProvider missing"); return c; };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [form, setForm] = useState<RequestForm>(emptyForm);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<Ctx["error"]>(null);
  const [loading, setLoading] = useState(false);
  const [expectations, setExpectations] = useState<Expectation[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHistory(loadHistory()); setConfigs(loadConfigs()); setHydrated(true); }, []);

  const persist = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    if (!saveHistory(next)) toast("Browser storage is unavailable, so history was not saved.", "error");
  }, [toast]);

  const execute = useCallback(async (f: RequestForm): Promise<boolean> => {
    const urlErr = validateUrlClient(f.url);
    if (urlErr) { toast(urlErr, "error"); return false; }
    const body = parseBody(f.bodyText);
    if (!body.ok) { toast(body.message, "error"); return false; }
    if (f.method === "GET" && body.value !== undefined) { toast("GET requests cannot have a body. Clear the body or pick another method.", "error"); return false; }
    setLoading(true); setValidation(null);
    let entry: HistoryEntry;
    try {
      const r = await sendRequest(f, body.value ?? null);
      setResult(r); setError(null);
      entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), request: stripSecrets(f), result: r, error: null, validation: null, hadAuth: requestUsesSecrets(f) };
      toast(`${r.status_code} ${r.reason} in ${r.elapsed_ms} ms`, r.http_ok ? "success" : "info");
    } catch (e) {
      const err = e instanceof ApiError ? { code: e.code, message: e.message } : { code: "unknown", message: "Something went wrong sending the request." };
      setResult(null); setError(err);
      entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), request: stripSecrets(f), result: null, error: err, validation: null, hadAuth: requestUsesSecrets(f) };
      toast(err.message, "error");
    }
    setCurrentId(entry.id);
    persist([entry, ...history]);
    setLoading(false);
    return true;
  }, [history, persist, toast]);

  const runValidation = useCallback(async () => {
    if (!result?.is_json) { toast("Send a request that returns JSON first.", "error"); return; }
    const exp = expectations.filter((e) => e.path.trim());
    if (!exp.length) { toast("Add at least one expected field.", "error"); return; }
    setValidating(true);
    try {
      const v = await validateJson(result.body_json, exp);
      setValidation(v);
      if (currentId) persist(history.map((h) => (h.id === currentId ? { ...h, validation: v } : h)));
      toast(v.valid ? "All expected fields passed." : "Validation found problems.", v.valid ? "success" : "info");
    } catch (e) { toast(e instanceof ApiError ? e.message : "Validation failed.", "error"); }
    setValidating(false);
  }, [result, expectations, currentId, history, persist, toast]);

  const reopen = (e: HistoryEntry) => {
    setForm(e.request); setResult(e.result); setError(e.error); setValidation(e.validation); setCurrentId(e.id);
    toast(e.hadAuth ? "Opened. Credentials are never saved, so re-enter them to send again." : "Opened saved result.", "info");
  };
  const rerun = async (e: HistoryEntry) => {
    setForm(e.request);
    if (e.hadAuth) { toast("This request used credentials, which are never saved. Re-enter them, then send.", "info"); return false; }
    return execute(e.request);
  };
  const value = useMemo<Ctx>(() => ({
    form, setForm, result, error, loading, send: () => execute(form),
    expectations, setExpectations, validation, validating, runValidation,
    history, hydrated, reopen, rerun,
    deleteEntry: (id) => { persist(history.filter((h) => h.id !== id)); toast("Record deleted."); },
    clearHistory: () => { persist([]); toast("History cleared."); },
    clearEverything: () => { clearAllStorage(); setHistory([]); setConfigs([]); toast("All saved data removed from this browser."); },
    configs,
    saveConfig: (name) => { const next = [{ id: crypto.randomUUID(), name: name.trim() || "Untitled", request: stripSecrets(form) }, ...configs]; setConfigs(next); saveConfigs(next); toast("Configuration saved (without credentials)."); },
    loadConfig: (c) => { setForm(c.request); toast(`Loaded “${c.name}”.`, "info"); },
    deleteConfig: (id) => { const next = configs.filter((c) => c.id !== id); setConfigs(next); saveConfigs(next); },
    hasCurrent: !!(result || error),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [form, result, error, loading, expectations, validation, validating, history, hydrated, configs, execute, runValidation]);
  return <WS.Provider value={value}>{children}</WS.Provider>;
}
