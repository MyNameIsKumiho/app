"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActionPart, PlayerAction } from "@aetherfall/core";
import { useAIStatus } from "@/components/AIBanner";
import { Composer } from "@/components/story/Composer";
import { PendingTurn, TurnCard } from "@/components/story/Narrative";
import { SavesModal } from "@/components/story/SavesModal";
import { SidePanel } from "@/components/story/SidePanel";
import { ErrorState, LoadingBlock, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { PlayTurnResponse, StoryDetail, TurnDTO } from "@/lib/types";

interface SettingsDTO {
  ai: { showDebug: boolean };
  gameplay: { showSuggestions: boolean };
}

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["story", id];
  const story = useQuery({ queryKey: key, queryFn: () => api<StoryDetail>(`/api/stories/${id}`) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsDTO>("/api/settings") });
  const ai = useAIStatus();
  const [staged, setStaged] = useState<ActionPart[]>([]);
  const [lastAction, setLastAction] = useState<PlayerAction | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const illustrate = useMutation({
    mutationFn: (turnId: string) => api<{ imageId: string }>(`/api/stories/${id}/illustrate`, { body: { turnId } }),
    onSuccess: ({ imageId }, turnId) =>
      qc.setQueryData<StoryDetail>(key, (prev) => prev && { ...prev, turns: prev.turns.map((t) => (t.id === turnId ? { ...t, imageId } : t)) }),
  });

  const play = useMutation({
    mutationFn: (action: PlayerAction) => api<PlayTurnResponse & { illustrate: boolean }>(`/api/stories/${id}/turn`, { body: { action } }),
    onMutate: (action) => {
      setLastAction(action);
      setStaged([]);
    },
    onSuccess: (res) => {
      qc.setQueryData<StoryDetail>(key, (prev) => prev && { ...prev, turns: [...prev.turns, res.turn], view: res.view, story: { ...prev.story, turn: res.view.turn, headTurnId: res.turn.id, alive: res.view.alive } });
      void qc.invalidateQueries({ queryKey: ["saves", id] });
      void qc.invalidateQueries({ queryKey: ["stories"] });
      if (res.illustrate) illustrate.mutate(res.turn.id);
    },
    onError: (_error, action) => setStaged(action.parts),
  });

  const rewind = useMutation({
    mutationFn: (turnId: string) => api(`/api/stories/${id}/rewind`, { body: { turnId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const addNote = useMutation({ mutationFn: (text: string) => api(`/api/stories/${id}/notes`, { body: { text } }), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const deleteNote = useMutation({ mutationFn: (noteId: string) => api(`/api/stories/${id}/notes`, { method: "DELETE", body: { noteId } }), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });

  const turnCount = story.data?.turns.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnCount, play.isPending]);

  const onRewind = useCallback(
    (turn: TurnDTO) => {
      if (window.confirm(`Вернуться к ходу ${turn.number}? Мир, память персонажей и время станут такими, какими были тогда.`)) rewind.mutate(turn.id);
    },
    [rewind],
  );
  const onIllustrate = useCallback((turn: TurnDTO) => illustrate.mutate(turn.id), [illustrate]);
  const stage = useCallback((part: ActionPart) => {
    setStaged((prev) => (prev.length >= 7 ? prev : [...prev, part]));
    setPanelOpen(false);
  }, []);

  if (story.isPending)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingBlock label="Возвращаемся в историю…" lines={6} />
      </div>
    );
  if (story.isError)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorState error={story.error} onRetry={() => story.refetch()} title="Не удалось открыть историю" />
        <Link href="/" className="btn-ghost mt-4">
          На главную
        </Link>
      </div>
    );

  const { view, turns, story: meta, illustrationMode } = story.data;
  const head = turns[turns.length - 1];
  const debug = settings.data?.ai.showDebug ?? false;
  const canIllustrate = illustrationMode !== "never";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 py-2.5 backdrop-blur-md">
        <Link href="/" className="btn-quiet" aria-label="На главную">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif">
            {meta.characterName} <span className="text-mist">· {meta.title}</span>
          </p>
          <p className="truncate text-xs text-fog">
            {view.time} · {view.location.name}
          </p>
        </div>
        {ai.data?.usingMock && (
          <Link href="/settings" className="chip hidden border-ember/40 text-ember sm:inline-flex" title="Отвечает демо-рассказчик без AI">
            демо-рассказчик
          </Link>
        )}
        <button className="btn-quiet" onClick={() => setSavesOpen(true)}>
          💾 <span className="hidden sm:inline">Сохранения</span>
        </button>
        <button className="btn-quiet lg:hidden" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
          ☰ Панель
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-8">
              {meta.latestScenarioVersion && meta.latestScenarioVersion !== meta.scenarioVersion && (
                <p className="rounded-lg border border-white/10 px-3 py-2 text-xs text-mist">
                  Эта история идёт на версии сценария {meta.scenarioVersion}. Автор выпустил {meta.latestScenarioVersion}: она будет использоваться в новых историях, а ваши сохранения не сломаются.
                </p>
              )}
              {turns.map((t) => (
                <TurnCard key={t.id} turn={t} view={view} isHead={t.id === head?.id} debug={debug} onRewind={onRewind} onIllustrate={onIllustrate} illustrating={illustrate.isPending && illustrate.variables === t.id} canIllustrate={canIllustrate} />
              ))}
              {play.isPending && <PendingTurn parts={lastAction} view={view} />}
              {play.isError && (
                <ErrorState error={play.error} title="Рассказчик не смог ответить" onRetry={lastAction ? () => play.mutate(lastAction) : undefined} />
              )}
              {illustrate.isError && <ErrorState error={illustrate.error} title="Иллюстрация не получилась" />}
              {rewind.isError && <ErrorState error={rewind.error} />}
              {!view.alive && (
                <div className="rounded-xl border border-rose/30 bg-rose/[0.06] p-5 text-center">
                  <p className="font-serif text-xl text-rose">Ваш путь оборвался</p>
                  <p className="mt-1 text-sm text-mist">Вернитесь к одному из прошлых ходов или загрузите сохранение.</p>
                  <button className="btn-ghost mt-3" onClick={() => setSavesOpen(true)}>
                    Открыть сохранения
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <Composer
            view={view}
            staged={staged}
            onStagedChange={setStaged}
            suggestions={head?.suggestions ?? []}
            showSuggestions={settings.data?.gameplay.showSuggestions ?? true}
            busy={play.isPending || rewind.isPending}
            disabled={!view.alive}
            onSubmit={(parts) => play.mutate({ parts })}
          />
        </main>

        <aside className={cx("w-full max-w-sm shrink-0 border-l border-white/[0.06] bg-ink-900/90", panelOpen ? "fixed inset-y-0 right-0 z-40 pt-12 backdrop-blur-md" : "hidden", "lg:static lg:block lg:pt-0")}>
          {panelOpen && (
            <button className="btn-quiet absolute top-2 right-2 lg:hidden" onClick={() => setPanelOpen(false)} aria-label="Закрыть панель">
              ✕
            </button>
          )}
          <SidePanel view={view} onStage={stage} onAddNote={(t) => addNote.mutate(t)} onDeleteNote={(n) => deleteNote.mutate(n)} noteBusy={addNote.isPending} />
        </aside>
      </div>

      <SavesModal
        storyId={id}
        open={savesOpen}
        onClose={() => setSavesOpen(false)}
        turns={turns}
        headTurnId={meta.headTurnId}
        onRewind={(t) => {
          setSavesOpen(false);
          onRewind(t);
        }}
      />
    </div>
  );
}
