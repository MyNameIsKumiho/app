"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SaveDTO, TurnDTO } from "@/lib/types";
import { ErrorState, LoadingBlock, Modal, Tabs } from "@/components/ui";

const SLOTS = [1, 2, 3, 4, 5, 6];

export function SavesModal({ storyId, open, onClose, turns, headTurnId, onRewind }: { storyId: string; open: boolean; onClose: () => void; turns: TurnDTO[]; headTurnId: string | null; onRewind: (turn: TurnDTO) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"saves" | "history">("saves");
  const [label, setLabel] = useState("");
  const saves = useQuery({ queryKey: ["saves", storyId], queryFn: () => api<SaveDTO[]>(`/api/stories/${storyId}/saves`), enabled: open });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["saves", storyId] });
    void qc.invalidateQueries({ queryKey: ["story", storyId] });
  };
  const save = useMutation({ mutationFn: (slot: number) => api<SaveDTO[]>(`/api/stories/${storyId}/saves`, { body: { slot, label: label || undefined } }), onSuccess: () => { setLabel(""); refresh(); } });
  const load = useMutation({ mutationFn: (saveId: string) => api(`/api/stories/${storyId}/saves/${saveId}`, { method: "POST" }), onSuccess: () => { refresh(); onClose(); } });
  const remove = useMutation({ mutationFn: (saveId: string) => api(`/api/stories/${storyId}/saves/${saveId}`, { method: "DELETE" }), onSuccess: refresh });

  const manual = new Map((saves.data ?? []).filter((s) => s.kind === "manual").map((s) => [s.slot, s]));
  const auto = (saves.data ?? []).filter((s) => s.kind === "auto");
  const error = save.error ?? load.error ?? remove.error;

  return (
    <Modal open={open} onClose={onClose} title="Сохранения и история" wide>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "saves", label: "Сохранения" },
          { id: "history", label: "Перемотка" },
        ]}
      />
      {error && (
        <div className="mb-3">
          <ErrorState error={error} />
        </div>
      )}
      {tab === "saves" && (
        <>
          {saves.isPending && <LoadingBlock />}
          {saves.isError && <ErrorState error={saves.error} onRetry={() => saves.refetch()} />}
          {saves.data && (
            <>
              <input className="input mb-3" placeholder="Название сохранения (необязательно)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
              <div className="grid gap-2 sm:grid-cols-2">
                {SLOTS.map((slot) => {
                  const s = manual.get(slot);
                  return (
                    <div key={slot} className="panel-raised p-3">
                      <p className="text-xs text-fog">Слот {slot}</p>
                      {s ? <SaveInfo save={s} /> : <p className="text-sm text-mist">Пусто</p>}
                      <div className="mt-2 flex gap-1">
                        <button className="btn-quiet text-xs text-aether" disabled={save.isPending} onClick={() => (!s || window.confirm("Перезаписать слот?")) && save.mutate(slot)}>
                          Сохранить сюда
                        </button>
                        {s && (
                          <button className="btn-quiet text-xs" disabled={load.isPending} onClick={() => load.mutate(s.id)}>
                            Загрузить
                          </button>
                        )}
                        {s && (
                          <button className="btn-quiet text-xs text-rose" onClick={() => remove.mutate(s.id)}>
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <h3 className="label mt-5">Автосохранения</h3>
              {auto.length === 0 && <p className="text-sm text-mist">Появятся после первого хода (если автосохранение включено).</p>}
              <div className="space-y-2">
                {auto.map((s) => (
                  <div key={s.id} className="panel-raised flex items-center justify-between gap-2 p-3">
                    <SaveInfo save={s} />
                    <button className="btn-quiet text-xs" disabled={load.isPending} onClick={() => load.mutate(s.id)}>
                      Загрузить
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {tab === "history" && (
        <div className="space-y-1">
          <p className="mb-3 text-sm text-mist">Вернитесь к любому ходу: состояние мира, память NPC и время восстановятся точно. Ходы после него останутся отдельной веткой.</p>
          {[...turns].reverse().map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
              <span className="w-12 text-xs text-fog tabular-nums">ход {t.number}</span>
              <span className="flex-1 truncate text-sm">{t.actionSummary || t.narrative.slice(0, 90)}</span>
              {t.id === headTurnId ? (
                <span className="text-xs text-jade">сейчас</span>
              ) : (
                <button className="btn-quiet text-xs" onClick={() => onRewind(t)}>
                  ⟲ Сюда
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function SaveInfo({ save }: { save: SaveDTO }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm">{save.label}</p>
      <p className="text-xs text-fog">
        Ход {save.turnNumber} · {save.location} · {save.time}
      </p>
      <p className="text-xs text-fog">
        {new Date(save.createdAt).toLocaleString("ru-RU")} · v{save.scenarioVersion}
      </p>
    </div>
  );
}
