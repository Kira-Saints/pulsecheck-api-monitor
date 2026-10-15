"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Activity, FileSearch, History, LayoutDashboard, Menu, Send, Settings, Webhook, X } from "lucide-react";
import { ToastProvider } from "./Toast";
import { WorkspaceProvider } from "./Workspace";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/request", label: "Request builder", icon: Send },
  { href: "/inspector", label: "Response inspector", icon: FileSearch },
  { href: "/history", label: "History", icon: History },
  { href: "/webhook", label: "Webhook tester", icon: Webhook },
  { href: "/settings", label: "Settings & help", icon: Settings },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <Icon className="h-4 w-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}

const Brand = () => (
  <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white"><Activity className="h-4 w-4" /></span>PulseCheck
  </Link>
);

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
          <div className="mb-6 px-1"><Brand /></div>
          <Nav />
          <p className="mt-auto px-1 text-xs text-slate-500">History is stored only in this browser.</p>
        </aside>
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <Brand />
          <button className="btn-secondary px-2.5" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {open && <div className="border-b border-slate-200 bg-white p-3 lg:hidden"><Nav onNavigate={() => setOpen(false)} /></div>}
        <main id="main" className="px-4 py-6 sm:px-8 lg:ml-60 lg:py-8"><div className="mx-auto max-w-5xl">{children}</div></main>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
