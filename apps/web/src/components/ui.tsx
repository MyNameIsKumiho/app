"use client";

import Link from "next/link";
import { useEffect, useId, type ReactNode } from "react";
import { errorMessage, ApiClientError } from "@/lib/api";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function LoadingBlock({ label = "Загрузка…", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-6">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 15}%` }} />
      ))}
      <p className="pt-2 text-sm text-fog">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Что-то пошло не так" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const lines = error instanceof ApiClientError ? error.lines : [];
  return (
    <div role="alert" className="rounded-xl border border-rose/30 bg-rose/[0.06] p-4 text-sm">
      <p className="font-medium text-rose">{title}</p>
      <p className="mt-1 text-parchment/90">{errorMessage(error)}</p>
      {lines.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-mist">
          {lines.slice(0, 8).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button className="btn-ghost mt-3" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <div aria-hidden className="mb-3 text-2xl text-aether/70">✦</div>
      <p className="font-serif text-lg">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-mist">{text}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-labelledby={titleId} className={cx("panel flex max-h-[88dvh] w-full animate-fade-in flex-col overflow-hidden", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <h2 id={titleId} className="font-serif text-lg">
            {title}
          </h2>
          <button className="btn-quiet" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx("flex flex-wrap gap-1", className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx("chip cursor-pointer px-3 py-1", value === t.id && "chip-active")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fog">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-aether-deep" : "bg-ink-600")}
      >
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white transition", checked ? "left-4.5" : "left-0.5")} />
      </button>
      <span>
        <span className="text-sm">{label}</span>
        {description && <span className="block text-xs text-fog">{description}</span>}
      </span>
    </label>
  );
}

export function Meter({ value, max, tone = "aether", label }: { value: number; max: number; tone?: "aether" | "rose" | "jade" | "ember"; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = { aether: "bg-aether", rose: "bg-rose", jade: "bg-jade", ember: "bg-ember" }[tone];
  return (
    <div role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
      <div className={cx("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/explore", label: "Исследовать" },
  { href: "/library", label: "Библиотека" },
  { href: "/create", label: "Создать" },
  { href: "/settings", label: "Настройки" },
];

export function TopBar({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-serif text-lg tracking-wide text-parchment">
          <span className="text-aether">✦</span> Aetherfall
        </Link>
        <nav className="ml-auto flex gap-1 overflow-x-auto text-sm">
          {NAV.slice(1).map((n) => (
            <Link key={n.href} href={n.href} className={cx("rounded-lg px-3 py-1.5 whitespace-nowrap transition hover:bg-white/5", current === n.href ? "text-parchment" : "text-mist")}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Page({ current, children, wide }: { current?: string; children: ReactNode; wide?: boolean }) {
  return (
    <>
      <TopBar current={current} />
      <main className={cx("mx-auto px-4 pt-8 pb-20", wide ? "max-w-7xl" : "max-w-6xl")}>{children}</main>
    </>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl tracking-wide sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-mist">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
