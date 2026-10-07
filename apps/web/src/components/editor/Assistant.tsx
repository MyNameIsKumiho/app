"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Scenario, ScenarioPatch } from "@aetherfall/core";
import { api } from "@/lib/api";
import { ErrorState, Spinner } from "@/components/ui";
import { PatchPreview } from "./PatchPreview";

interface Message {
  role: "user" | "assistant";
  content: string;
  proposals?: ScenarioPatch[];
}

/**
 * Persistent editor assistant. It sees the current draft, answers questions
 * and proposes patches; the draft only changes when the author applies one.
 */
export function Assistant({ scenario, onApply, applying }: { scenario: Scenario; onApply: (patch: ScenarioPatch) => Promise<void>; applying: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const ask = useMutation({
    mutationFn: (message: string) =>
      api<{ reply: string; proposals: ScenarioPatch[] }>("/api/creator", {
        body: { op: "assistant", scenario, message, history: messages.map((m) => ({ role: m.role, content: m.content })).slice(-10) },
      }),
    onSuccess: (res) => setMessages((prev) => [...prev, { role: "assistant", content: res.reply, proposals: res.proposals }]),
  });
  const alternatives = useMutation({
    mutationFn: (instruction: string) => api<{ patches: ScenarioPatch[] }>("/api/creator", { body: { op: "alternatives", scenario, instruction } }),
    onSuccess: (res) => setMessages((prev) => [...prev, { role: "assistant", content: "Вот три разных варианта. Выберите один или ни одного.", proposals: res.patches }]),
  });
  const busy = ask.isPending || alternatives.isPending;

  const send = (kind: "ask" | "alternatives") => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((prev) => [...prev, { role: "user", content: kind === "alternatives" ? `3 варианта: ${text}` : text }]);
    setInput("");
    if (kind === "ask") ask.mutate(text);
    else alternatives.mutate(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="font-serif">Ассистент</p>
        <p className="text-xs text-fog">Видит текущий черновик. Предложения применяются только по вашей кнопке.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && (
          <div className="space-y-2 text-mist">
            <p>Попросите, например:</p>
            {["Добавь организацию магов", "Сделай мир мрачнее", "Проверь, нет ли противоречий в лоре", "Добавь соперника для героя"].map((s) => (
              <button key={s} className="chip block cursor-pointer hover:text-parchment" onClick={() => setInput(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-6 rounded-xl bg-aether/10 px-3 py-2" : ""}>
            <p className="whitespace-pre-line">{m.content}</p>
            {m.proposals
              ?.filter((_, j) => !dismissed.has(`${i}:${j}`))
              .map((p, j) => (
                <div key={j} className="mt-2">
                  <PatchPreview
                    patch={p}
                    busy={applying}
                    onApply={async () => {
                      await onApply(p);
                      setDismissed((d) => new Set(d).add(`${i}:${j}`));
                    }}
                    onReject={() => setDismissed((d) => new Set(d).add(`${i}:${j}`))}
                  />
                </div>
              ))}
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-mist">
            <Spinner className="size-3" /> Думаю…
          </p>
        )}
        {(ask.error ?? alternatives.error) && <ErrorState error={ask.error ?? alternatives.error} />}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <textarea
          className="input min-h-16 resize-none"
          placeholder="Что изменить или обсудить?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send("ask");
            }
          }}
        />
        <div className="mt-2 flex gap-2">
          <button className="btn-primary flex-1 py-1.5 text-xs" disabled={busy || !input.trim()} onClick={() => send("ask")}>
            Спросить
          </button>
          <button className="btn-ghost py-1.5 text-xs" disabled={busy || !input.trim()} onClick={() => send("alternatives")} title="Сгенерировать три разных варианта изменения">
            3 варианта
          </button>
        </div>
      </div>
    </div>
  );
}
