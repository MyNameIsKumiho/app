"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FIELD_ACTION_LABELS, type FieldAction, type Scenario } from "@aetherfall/core";
import { api } from "@/lib/api";
import { ErrorState, Spinner } from "@/components/ui";

interface Suggestions {
  suggestions: { title: string; text: string }[];
  note: string;
}

/**
 * "✨ Помочь с AI" for one field. Suggestions are shown side by side with the
 * current value; nothing changes until the author picks one.
 */
export function AIFieldAssist({ scenario, label, value, onAccept }: { scenario: Scenario; label: string; value: string; onAccept: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const run = useMutation({
    mutationFn: (action: FieldAction) => api<Suggestions>("/api/creator", { body: { op: "field", scenario, fieldLabel: label, value, action, wish: wish || undefined } }),
  });

  if (!open)
    return (
      <button type="button" className="btn-quiet px-2 py-0.5 text-xs text-aether" onClick={() => setOpen(true)}>
        {FIELD_ACTION_LABELS.help}
      </button>
    );

  return (
    <div className="mt-2 rounded-xl border border-aether/25 bg-aether/[0.05] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-aether">AI-помощник: {label}</p>
        <button
          type="button"
          className="btn-quiet px-2 py-0.5 text-xs"
          onClick={() => {
            setOpen(false);
            run.reset();
          }}
        >
          Закрыть
        </button>
      </div>
      <input className="input mt-2 text-xs" placeholder="Пожелание (необязательно): «мрачнее», «больше интриги»…" value={wish} onChange={(e) => setWish(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-1">
        {(Object.keys(FIELD_ACTION_LABELS) as FieldAction[]).map((a) => (
          <button key={a} type="button" className="chip cursor-pointer hover:text-parchment" disabled={run.isPending} onClick={() => run.mutate(a)}>
            {FIELD_ACTION_LABELS[a]}
          </button>
        ))}
      </div>
      {run.isPending && (
        <p className="mt-3 flex items-center gap-2 text-xs text-mist">
          <Spinner className="size-3" /> Думаю…
        </p>
      )}
      {run.isError && (
        <div className="mt-2">
          <ErrorState error={run.error} />
        </div>
      )}
      {run.data && (
        <div className="mt-3 space-y-2">
          {run.data.note && <p className="text-xs text-mist">{run.data.note}</p>}
          {run.data.suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-ink-900/70 p-3">
              <p className="text-xs font-medium">{s.title}</p>
              <p className="mt-1 text-sm whitespace-pre-line text-parchment/90">{s.text}</p>
              <div className="mt-2 flex gap-1">
                <button type="button" className="btn-quiet px-2 py-0.5 text-xs text-aether" onClick={() => onAccept(s.text)}>
                  Заменить
                </button>
                <button type="button" className="btn-quiet px-2 py-0.5 text-xs" onClick={() => onAccept(value ? `${value}\n\n${s.text}` : s.text)}>
                  Добавить в конец
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
