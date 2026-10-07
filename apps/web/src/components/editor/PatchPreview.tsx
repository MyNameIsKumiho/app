"use client";

import type { PatchOperation, ScenarioPatch } from "@aetherfall/core";

const COLLECTION: Record<string, string> = { locations: "локацию", npcs: "персонажа", factions: "фракцию", abilities: "способность", items: "предмет", lore: "запись лора", quests: "задание", timeline: "событие" };

function describeOp(op: PatchOperation): string {
  const name = (v: Record<string, unknown>) => String(v.name ?? v.title ?? v.id ?? "");
  switch (op.op) {
    case "set":
      return `Изменить «${op.path}»`;
    case "add":
      return `Добавить ${COLLECTION[op.collection] ?? op.collection}: ${name(op.value)}`;
    case "update":
      return `Изменить ${COLLECTION[op.collection] ?? op.collection} «${op.id}»: ${Object.keys(op.value).join(", ")}`;
    case "remove":
      return `Удалить ${COLLECTION[op.collection] ?? op.collection} «${op.id}»`;
  }
}

/** Shows exactly what an AI proposal would change, before the author accepts it. */
export function PatchPreview({ patch, onApply, onReject, busy, applyLabel = "Применить" }: { patch: ScenarioPatch; onApply: () => void; onReject?: () => void; busy?: boolean; applyLabel?: string }) {
  return (
    <div className="rounded-xl border border-aether/25 bg-ink-900/70 p-3">
      <p className="font-medium">{patch.title}</p>
      {patch.summary && <p className="mt-1 text-sm text-mist">{patch.summary}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-parchment/80">
        {patch.operations.map((op, i) => (
          <li key={i}>• {describeOp(op)}</li>
        ))}
      </ul>
      <details className="mt-2 text-xs text-fog">
        <summary className="cursor-pointer">Подробности</summary>
        <pre className="mt-1 max-h-60 overflow-auto rounded bg-ink-950 p-2 whitespace-pre-wrap">{JSON.stringify(patch.operations, null, 2)}</pre>
      </details>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={onApply}>
          {applyLabel}
        </button>
        {onReject && (
          <button className="btn-quiet text-xs" onClick={onReject}>
            Отклонить
          </button>
        )}
      </div>
    </div>
  );
}
