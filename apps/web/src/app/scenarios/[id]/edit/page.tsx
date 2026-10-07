"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScenarioSchema, validateScenario, type Scenario, type ScenarioPatch, type ValidationReport } from "@aetherfall/core";
import { Assistant } from "@/components/editor/Assistant";
import { CollectionEditor } from "@/components/editor/CollectionEditor";
import { FormFields } from "@/components/editor/FormFields";
import { ValidationList } from "@/components/editor/ValidationList";
import { ErrorState, LoadingBlock, Modal, Page, Spinner, cx } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { SECTIONS, sectionOf } from "@/lib/editorSchema";
import type { ScenarioCard, ScenarioDetail } from "@/lib/types";

type AIReview = { issues: { level: "error" | "warning" | "suggestion"; message: string; section: string }[] };

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["scenario", id], queryFn: () => api<ScenarioDetail>(`/api/scenarios/${id}`) });
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState("general");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [checkOpen, setCheckOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Initialise the local draft once the server copy arrives.
  if (detail.data?.scenario && draft === null) setDraft(detail.data.scenario);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const parsed = useMemo(() => (draft ? ScenarioSchema.safeParse(draft) : null), [draft]);
  const report: ValidationReport | null = useMemo(() => (parsed?.success ? validateScenario(parsed.data) : null), [parsed]);
  const schemaErrors = parsed && !parsed.success ? parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) : [];
  const counts = report ? { error: report.issues.filter((i) => i.level === "error").length, warning: report.issues.filter((i) => i.level === "warning").length } : { error: schemaErrors.length, warning: 0 };

  const edit = (next: Scenario) => {
    setDraft(next);
    setDirty(true);
  };
  const replace = (next: Scenario) => {
    setDraft(next);
    setRevision((r) => r + 1);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => api<ScenarioDetail>(`/api/scenarios/${id}`, { method: "PUT", body: { scenario: draft } }),
    onSuccess: (res) => {
      qc.setQueryData(["scenario", id], res);
      void qc.invalidateQueries({ queryKey: ["scenarios"] });
      setDraft(res.scenario);
      setDirty(false);
    },
  });
  const applyPatch = useMutation({
    mutationFn: (patch: ScenarioPatch) => api<{ scenario: Scenario }>("/api/creator", { body: { op: "apply_patch", scenario: draft, patch } }),
    onSuccess: (res) => replace(res.scenario),
  });
  const review = useMutation({ mutationFn: () => api<AIReview>("/api/creator", { body: { op: "review", scenario: draft } }) });
  const publish = useMutation({
    mutationFn: async (input: { visibility: "published" | "private"; bump: "patch" | "minor" | "major" }) => {
      if (dirty) await save.mutateAsync();
      return api<ScenarioDetail>(`/api/scenarios/${id}/publish`, { body: input });
    },
    onSuccess: (res) => {
      qc.setQueryData(["scenario", id], res);
      void qc.invalidateQueries({ queryKey: ["scenarios"] });
      setDraft(res.scenario);
      setRevision((r) => r + 1);
      setDirty(false);
      setPublishOpen(false);
    },
  });
  const remix = useMutation({ mutationFn: () => api<ScenarioCard>(`/api/scenarios/${id}/remix`, { body: {} }), onSuccess: (c) => router.push(`/scenarios/${c.id}/edit`) });

  if (detail.isPending)
    return (
      <Page>
        <LoadingBlock label="Открываем редактор…" lines={6} />
      </Page>
    );
  if (detail.isError)
    return (
      <Page>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Page>
    );
  if (!detail.data.scenario)
    return (
      <Page>
        <div className="panel p-8 text-center">
          <p className="font-serif text-xl">Этот сценарий принадлежит другому автору</p>
          <p className="mt-2 text-mist">Сделайте ремикс: появится ваша копия с пометкой «Основано на…».</p>
          {detail.data.card.allowRemix ? (
            <button className="btn-primary mt-4" disabled={remix.isPending} onClick={() => remix.mutate()}>
              Сделать ремикс
            </button>
          ) : (
            <p className="mt-4 text-sm text-rose">Автор запретил ремиксы.</p>
          )}
        </div>
      </Page>
    );
  if (!draft) return null;

  const spec = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  const card = detail.data.card;
  const publishError = publish.error instanceof ApiClientError && publish.error.status === 422 ? (publish.error.details as ValidationReport | undefined) : undefined;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-ink-950/85 px-4 py-2.5 backdrop-blur-md">
        <Link href={`/scenarios/${id}`} className="btn-quiet" aria-label="К сценарию">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif">{draft.metadata.title}</p>
          <p className="text-xs text-fog">
            v{card.version} · {card.status === "published" ? "опубликован" : card.status === "private" ? "приватный" : "черновик"} · {dirty ? <span className="text-ember">есть несохранённые изменения</span> : "сохранено"}
          </p>
        </div>
        <button className={cx("chip cursor-pointer px-3 py-1", counts.error > 0 ? "border-rose/40 text-rose" : counts.warning > 0 ? "text-ember" : "text-jade")} onClick={() => setCheckOpen(true)}>
          {counts.error > 0 ? `✕ ${counts.error}` : "✓"} {counts.warning > 0 && `! ${counts.warning}`} Проверка
        </button>
        <button className="btn-quiet hidden md:inline-flex" onClick={() => setAssistantOpen((v) => !v)}>
          {assistantOpen ? "Скрыть ассистента" : "Ассистент"}
        </button>
        <a className="btn-quiet" href={`/api/scenarios/${id}/export`} download>
          Экспорт
        </a>
        <Link className="btn-quiet" href={`/scenarios/${id}/new`} onClick={(e) => dirty && !window.confirm("Есть несохранённые изменения. Тест запустит сохранённую версию. Продолжить?") && e.preventDefault()}>
          ▶ Тест
        </Link>
        <button className="btn-ghost" onClick={() => setPublishOpen(true)}>
          Публикация
        </button>
        <button className="btn-primary" disabled={!dirty || save.isPending || schemaErrors.length > 0} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : "Сохранить"}
        </button>
      </header>
      {(save.error ?? applyPatch.error) && (
        <div className="px-4 pt-3">
          <ErrorState error={save.error ?? applyPatch.error} />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 overflow-y-auto border-r border-white/[0.06] p-3 md:block" aria-label="Разделы">
          {SECTIONS.map((s) => {
            const n = report?.issues.filter((i) => i.level === "error" && sectionOf(i.section) === s.id).length ?? 0;
            return (
              <button key={s.id} className={cx("flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm", section === s.id ? "bg-aether/15 text-parchment" : "text-mist hover:bg-white/5")} onClick={() => setSection(s.id)}>
                {s.label}
                {s.collection && <span className="text-xs text-fog">{(draft[s.collection.key] as unknown[]).length}</span>}
                {n > 0 && <span className="text-xs text-rose">✕{n}</span>}
              </button>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <select className="input mb-4 md:hidden" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Раздел">
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <h1 className="mb-6 font-serif text-2xl">{spec.label}</h1>
          {schemaErrors.length > 0 && (
            <div className="mb-4 rounded-xl border border-rose/30 bg-rose/[0.06] p-3 text-sm">
              <p className="text-rose">Черновик нельзя сохранить, пока не исправлены поля:</p>
              <ul className="mt-1 list-disc pl-5 text-mist">
                {schemaErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="max-w-3xl">
            {spec.fields && <FormFields key={`${revision}-${spec.id}`} fields={spec.fields} value={draft as unknown as Record<string, unknown>} scenario={draft} onChange={(next) => edit(next as unknown as Scenario)} />}
            {spec.collection && (
              <CollectionEditor
                key={`${revision}-${spec.id}`}
                spec={spec.collection}
                scenario={draft}
                revision={revision}
                onChange={(list) => edit({ ...draft, [spec.collection!.key]: list } as Scenario)}
              />
            )}
          </div>
        </main>
        {assistantOpen && (
          <aside className="hidden w-96 shrink-0 border-l border-white/[0.06] bg-ink-900/70 md:block">
            <Assistant scenario={draft} applying={applyPatch.isPending} onApply={async (p) => void (await applyPatch.mutateAsync(p))} />
          </aside>
        )}
      </div>

      <Modal open={checkOpen} onClose={() => setCheckOpen(false)} title="Проверка сценария" wide>
        {schemaErrors.length > 0 && <ErrorState title="Структура черновика" error={new ApiClientError("Некоторые поля заполнены неверно", 400, undefined, schemaErrors)} />}
        {report && (
          <>
            <p className="mb-3 text-sm text-mist">
              {report.canPublish ? "Сценарий можно публиковать." : "Есть ошибки, из-за которых сценарий не запустится."} Предупреждения и советы публикацию не блокируют.
            </p>
            <ValidationList
              report={report}
              onJump={(s) => {
                setSection(sectionOf(s));
                setCheckOpen(false);
              }}
            />
          </>
        )}
        <div className="mt-6 border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between">
            <p className="font-serif">Проверка AI</p>
            <button className="btn-ghost py-1 text-xs" disabled={review.isPending || !parsed?.success} onClick={() => review.mutate()}>
              {review.isPending ? <Spinner /> : "Найти противоречия и слабые места"}
            </button>
          </div>
          {review.isError && <ErrorState error={review.error} />}
          {review.data && (
            <div className="mt-3">
              <ValidationList report={review.data} />
            </div>
          )}
        </div>
      </Modal>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        status={card.status}
        busy={publish.isPending}
        error={publishError ? null : publish.error}
        blocked={publishError ?? (report && !report.canPublish ? report : null)}
        onPublish={(input) => publish.mutate(input)}
      />
    </div>
  );
}

function PublishDialog({ open, onClose, status, busy, error, blocked, onPublish }: { open: boolean; onClose: () => void; status: string; busy: boolean; error: unknown; blocked: ValidationReport | null; onPublish: (input: { visibility: "published" | "private"; bump: "patch" | "minor" | "major" }) => void }) {
  const [bump, setBump] = useState<"patch" | "minor" | "major">("minor");
  const released = status !== "draft";
  return (
    <Modal open={open} onClose={onClose} title="Публикация">
      <p className="text-sm text-mist">
        Перед публикацией сценарий проверяется. {released ? "Новая версия получит следующий номер; уже начатые истории останутся на своей версии и не сломаются." : "Первая публикация выйдет как версия 1.0.0."}
      </p>
      {released && (
        <div className="mt-4 flex gap-2">
          {(
            [
              ["patch", "Исправления"],
              ["minor", "Дополнения"],
              ["major", "Большие изменения"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={cx("chip cursor-pointer px-3 py-1", bump === v && "chip-active")} onClick={() => setBump(v)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {blocked && !blocked.canPublish && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-rose">Сначала исправьте ошибки:</p>
          <ValidationList report={{ issues: blocked.issues.filter((i) => i.level === "error") }} />
        </div>
      )}
      {error ? <ErrorState error={error} /> : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || (blocked !== null && !blocked.canPublish)} onClick={() => onPublish({ visibility: "published", bump })}>
          {busy ? <Spinner /> : "Опубликовать в каталоге"}
        </button>
        <button className="btn-ghost" disabled={busy || (blocked !== null && !blocked.canPublish)} onClick={() => onPublish({ visibility: "private", bump })}>
          Сохранить как приватный
        </button>
      </div>
    </Modal>
  );
}
