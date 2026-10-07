"use client";

import { cx } from "@/components/ui";

const LEVEL = {
  error: { label: "Ошибка", tone: "text-rose", icon: "✕" },
  warning: { label: "Предупреждение", tone: "text-ember", icon: "!" },
  suggestion: { label: "Совет", tone: "text-aether", icon: "✦" },
} as const;

export interface IssueLike {
  level: "error" | "warning" | "suggestion";
  message: string;
  section: string;
}

export function ValidationList({ report, onJump }: { report: { issues: IssueLike[] }; onJump?: (section: string) => void }) {
  if (report.issues.length === 0) return <p className="text-sm text-jade">Проблем не найдено.</p>;
  const order = ["error", "warning", "suggestion"] as const;
  const sorted = [...report.issues].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <ul className="space-y-1.5 text-sm">
      {sorted.map((issue, i) => {
        const l = LEVEL[issue.level];
        return (
          <li key={i} className="flex gap-2">
            <span className={cx("w-4 shrink-0 text-center font-bold", l.tone)} title={l.label}>
              {l.icon}
            </span>
            <span className="flex-1">{issue.message}</span>
            {onJump && (
              <button className="btn-quiet shrink-0 px-2 py-0 text-xs" onClick={() => onJump(issue.section)}>
                Перейти
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
