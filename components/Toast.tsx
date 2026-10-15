"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";

type Kind = "success" | "error" | "info";
interface T { id: number; kind: Kind; text: string }
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const dismiss = (id: number) => setItems((s) => s.filter((t) => t.id !== id));
  const push = useCallback((text: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  const icon = { success: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, error: <XCircle className="h-4 w-4 text-red-600" />, info: <Info className="h-4 w-4 text-indigo-600" /> };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="card flex items-start gap-2 p-3 text-sm shadow-md">
            <span className="mt-0.5">{icon[t.kind]}</span>
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
