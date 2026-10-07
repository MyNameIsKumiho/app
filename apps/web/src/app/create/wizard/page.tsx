"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Scenario, ScenarioPatch, ValidationReport } from "@aetherfall/core";
import { AIBanner } from "@/components/AIBanner";
import { PatchPreview } from "@/components/editor/PatchPreview";
import { ValidationList } from "@/components/editor/ValidationList";
import { ErrorState, Page, PageTitle, Spinner, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { ScenarioCard } from "@/lib/types";

interface Question {
  id: string;
  question: string;
  why: string;
  options: { id: string; label: string; description: string }[];
  allowCustom: boolean;
}
interface Analysis {
  summary: string;
  questions: Question[];
}
interface WizardState {
  idea: string;
  analysis: Analysis | null;
  answers: Record<string, string>;
  draft: Scenario | null;
  validation: ValidationReport | null;
}

const STORAGE_KEY = "aetherfall.wizard";
const EXAMPLES = [
  "Я переродился младшим братом главного злодея в магической академии и получил систему, позволяющую воровать способности",
  "Детектив-нуар в городе, где каждую ночь кто-то просыпается с чужими воспоминаниями",
  "Космическая станция на краю галактики, экипаж которой медленно забывает, зачем сюда прилетел",
];
const EMPTY: WizardState = { idea: "", analysis: null, answers: {}, draft: null, validation: null };

function loadState(): WizardState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as WizardState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export default function WizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<ScenarioPatch[]>([]);
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ profile: { authorName: string } }>("/api/settings") });

  // Restore an unfinished wizard after a reload (the draft is only in this tab until saved).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage requires an effect
    setState(loadState());
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or disabled: the wizard still works in memory */
    }
  }, [state, restored]);

  const analyze = useMutation({
    mutationFn: () => api<Analysis>("/api/creator", { body: { op: "analyze", idea: state.idea } }),
    onSuccess: (analysis) => setState((s) => ({ ...s, analysis, answers: {}, draft: null, validation: null })),
  });
  const draft = useMutation({
    mutationFn: () =>
      api<{ scenario: Scenario; validation: ValidationReport }>("/api/creator", {
        body: {
          op: "draft",
          idea: state.idea,
          authorName: settings.data?.profile.authorName ?? "Игрок",
          answers: (state.analysis?.questions ?? []).map((q) => ({ questionId: q.id, question: q.question, answer: state.answers[q.id] || "На усмотрение AI" })),
        },
      }),
    onSuccess: (res) => setState((s) => ({ ...s, draft: res.scenario, validation: res.validation })),
  });
  const revise = useMutation({
    mutationFn: (kind: "revise" | "alternatives") => api<{ patch?: ScenarioPatch; patches?: ScenarioPatch[] }>("/api/creator", { body: { op: kind, scenario: state.draft, instruction } }),
    onSuccess: (res) => setPending(res.patches ?? (res.patch ? [res.patch] : [])),
  });
  const apply = useMutation({
    mutationFn: (patch: ScenarioPatch) => api<{ scenario: Scenario; validation: ValidationReport }>("/api/creator", { body: { op: "apply_patch", scenario: state.draft, patch } }),
    onSuccess: (res) => {
      setState((s) => ({ ...s, draft: res.scenario, validation: res.validation }));
      setPending([]);
      setInstruction("");
    },
  });
  const save = useMutation({
    mutationFn: (then: "edit" | "play") => api<ScenarioCard>("/api/scenarios", { body: { title: state.draft?.metadata.title, data: state.draft } }).then((card) => ({ card, then })),
    onSuccess: ({ card, then }) => {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      router.push(then === "edit" ? `/scenarios/${card.id}/edit` : `/scenarios/${card.id}/new`);
    },
  });

  const step = state.draft ? 3 : state.analysis ? 2 : 1;
  const reset = () => {
    setState(EMPTY);
    setPending([]);
  };

  return (
    <Page current="/create">
      <AIBanner />
      <PageTitle title="AI-мастер сценариев" subtitle="AI не решает за вас: он задаёт вопросы, предлагает варианты и меняет только то, что вы попросите." actions={step > 1 ? <button className="btn-quiet" onClick={reset}>Начать заново</button> : null} />
      <ol className="mb-8 flex gap-2 text-sm">
        {["Идея", "Вопросы", "Черновик"].map((label, i) => (
          <li key={label} className={cx("chip px-3 py-1", step === i + 1 && "chip-active", step > i + 1 && "text-jade")}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="max-w-3xl">
          <textarea className="input min-h-36 text-base" placeholder="Опишите идею: кто герой, какой мир, в чём завязка…" value={state.idea} onChange={(e) => setState((s) => ({ ...s, idea: e.target.value }))} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip cursor-pointer text-left hover:text-parchment" onClick={() => setState((s) => ({ ...s, idea: ex }))}>
                {ex.length > 70 ? `${ex.slice(0, 70)}…` : ex}
              </button>
            ))}
          </div>
          {analyze.isError && (
            <div className="mt-4">
              <ErrorState error={analyze.error} onRetry={() => analyze.mutate()} />
            </div>
          )}
          <button className="btn-primary mt-6 px-6 py-3" disabled={state.idea.trim().length < 10 || analyze.isPending} onClick={() => analyze.mutate()}>
            {analyze.isPending ? (
              <>
                <Spinner /> Разбираю идею…
              </>
            ) : (
              "Дальше: вопросы"
            )}
          </button>
        </section>
      )}

      {step === 2 && state.analysis && (
        <section className="max-w-3xl space-y-6">
          <div className="panel p-5">
            <p className="label">Как я понял идею</p>
            <p className="font-serif">{state.analysis.summary}</p>
          </div>
          {state.analysis.questions.map((q) => {
            const answer = state.answers[q.id] ?? "";
            const isCustom = answer !== "" && !q.options.some((o) => o.label === answer);
            const setAnswer = (v: string) => setState((s) => ({ ...s, answers: { ...s.answers, [q.id]: v } }));
            return (
              <fieldset key={q.id}>
                <legend className="font-serif text-lg">{q.question}</legend>
                {q.why && <p className="text-xs text-fog">{q.why}</p>}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <button key={o.id} className={cx("rounded-xl border p-3 text-left transition", answer === o.label ? "border-aether/70 bg-aether/10" : "border-white/10 bg-ink-900/60 hover:border-white/20")} onClick={() => setAnswer(o.label)}>
                      <span className="block text-sm font-medium">{o.label}</span>
                      {o.description && <span className="mt-0.5 block text-xs text-mist">{o.description}</span>}
                    </button>
                  ))}
                </div>
                {q.allowCustom && <input className={cx("input mt-2", isCustom && "border-aether/60")} placeholder="Свой вариант…" value={isCustom ? answer : ""} onChange={(e) => setAnswer(e.target.value)} />}
              </fieldset>
            );
          })}
          {draft.isError && <ErrorState error={draft.error} onRetry={() => draft.mutate()} />}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary px-6 py-3" disabled={draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? (
                <>
                  <Spinner /> Строю мир… это может занять минуту
                </>
              ) : (
                "Собрать черновик"
              )}
            </button>
            <button className="btn-quiet" onClick={() => setState((s) => ({ ...s, analysis: null }))}>
              ← Изменить идею
            </button>
          </div>
          <p className="text-xs text-fog">Вопросы без ответа AI решит сам, и вы сможете всё поменять в черновике.</p>
        </section>
      )}

      {step === 3 && state.draft && (
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <DraftPreview scenario={state.draft} />
          <aside className="space-y-4">
            <div className="panel space-y-2 p-5">
              <button className="btn-primary w-full py-3" disabled={save.isPending} onClick={() => save.mutate("play")}>
                Сохранить и играть
              </button>
              <button className="btn-ghost w-full" disabled={save.isPending} onClick={() => save.mutate("edit")}>
                Сохранить и открыть в редакторе
              </button>
              {save.isError && <ErrorState error={save.error} />}
            </div>
            <div className="panel p-5">
              <p className="font-serif text-lg">Что изменить?</p>
              <p className="mt-1 text-xs text-fog">Я поменяю только затронутые части и покажу изменения до применения.</p>
              <textarea className="input mt-3 min-h-20" placeholder="«Добавь больше политики», «Сделай систему опаснее», «Мне не нравится злодей»…" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button className="btn-ghost flex-1" disabled={!instruction.trim() || revise.isPending} onClick={() => revise.mutate("revise")}>
                  Изменить
                </button>
                <button className="btn-ghost flex-1" disabled={!instruction.trim() || revise.isPending} onClick={() => revise.mutate("alternatives")}>
                  3 варианта
                </button>
              </div>
              {revise.isPending && (
                <p className="mt-3 flex items-center gap-2 text-sm text-mist">
                  <Spinner className="size-3" /> Готовлю предложение…
                </p>
              )}
              {(revise.error ?? apply.error) && (
                <div className="mt-3">
                  <ErrorState error={revise.error ?? apply.error} />
                </div>
              )}
              <div className="mt-3 space-y-2">
                {pending.map((p, i) => (
                  <PatchPreview key={i} patch={p} busy={apply.isPending} onApply={() => apply.mutate(p)} onReject={() => setPending((list) => list.filter((_, j) => j !== i))} applyLabel={pending.length > 1 ? "Выбрать этот вариант" : "Применить"} />
                ))}
              </div>
            </div>
            {state.validation && (
              <div className="panel p-5">
                <p className="mb-2 font-serif text-lg">Проверка</p>
                <ValidationList report={state.validation} />
              </div>
            )}
          </aside>
        </div>
      )}
    </Page>
  );
}

function DraftPreview({ scenario: s }: { scenario: Scenario }) {
  const block = (title: string, items: { name: string; text: string }[]) =>
    items.length > 0 && (
      <section>
        <h3 className="label">
          {title} · {items.length}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((x, i) => (
            <div key={i} className="panel-raised p-3">
              <p className="font-medium">{x.name}</p>
              <p className="mt-1 line-clamp-3 text-xs text-mist">{x.text}</p>
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <article className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl">{s.metadata.title}</h2>
        <p className="mt-2 text-mist">{s.metadata.shortDescription}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {[...s.tags.genre, ...s.tags.tone].map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </div>
      {s.world.description && (
        <section>
          <h3 className="label">Мир{s.world.name && `: ${s.world.name}`}</h3>
          <p className="whitespace-pre-line">{s.world.description}</p>
        </section>
      )}
      {s.start.situation && (
        <section className="panel p-4">
          <h3 className="label">Старт</h3>
          <p className="font-serif">{s.start.situation}</p>
        </section>
      )}
      {s.system.enabled && (
        <div className="system-window">
          <p className="font-medium">[{s.system.name}]</p>
          <p className="mt-1 text-system/80">{s.system.description}</p>
        </div>
      )}
      {block("Персонажи", s.npcs.map((n) => ({ name: n.name, text: n.description })))}
      {block("Локации", s.locations.map((l) => ({ name: l.name, text: l.description })))}
      {block("Способности", s.abilities.map((a) => ({ name: a.name, text: a.description })))}
      {block("Фракции", s.factions.map((f) => ({ name: f.name, text: f.description })))}
      {block("Задания", s.quests.map((q) => ({ name: q.title, text: q.description })))}
      {block("Хронология", s.timeline.map((t) => ({ name: t.title, text: t.description })))}
      {block("Лор", s.lore.map((l) => ({ name: l.name, text: l.description })))}
    </article>
  );
}
