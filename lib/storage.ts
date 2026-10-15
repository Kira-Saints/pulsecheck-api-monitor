import type { HistoryEntry, SavedConfig } from "./types";
import { trimEntry } from "./redact";

export const MAX_HISTORY = 50;
const HISTORY_KEY = "pulsecheck:history:v1";
const CONFIG_KEY = "pulsecheck:configs:v1";
const MAX_CONFIGS = 20;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(key: string, value: unknown): boolean {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; } // quota exceeded or storage disabled
}

export const loadHistory = () => read<HistoryEntry>(HISTORY_KEY);
export function saveHistory(entries: HistoryEntry[]): boolean {
  let list = entries.slice(0, MAX_HISTORY).map(trimEntry);
  while (!write(HISTORY_KEY, list) && list.length > 1) list = list.slice(0, Math.floor(list.length / 2));
  return list.length > 0;
}
export const loadConfigs = () => read<SavedConfig>(CONFIG_KEY);
export const saveConfigs = (c: SavedConfig[]) => write(CONFIG_KEY, c.slice(0, MAX_CONFIGS));
export const clearAllStorage = () => {
  try { window.localStorage.removeItem(HISTORY_KEY); window.localStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ }
};
