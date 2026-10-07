"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CharacterField } from "@aetherfall/core";
import { ErrorState, Field, LoadingBlock, Page, PageTitle, Spinner, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { ScenarioDetail } from "@/lib/types";

interface Candidate {
  name: string;
  summary: string;
  fields: Record<string, string>;
}

const VISUAL_FIELDS = [
  ["hair", "Волосы"],
  ["eyes", "Глаза"],
  ["clothing", "Одежда"],
  ["distinctiveFeatures", "Особые приметы"],
] as const;

export default function NewStoryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const detail = useQuery({ queryKey: ["scenario", id], queryFn: () => api<ScenarioDetail>(`/api/scenarios/${id}`) });
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [visual, setVisual] = useState<Record<string, string>>({});
  const [request, setRequest] = useState("");

  const generate = useMutation({ mutationFn: () => api<{ characters: Candidate[] }>("/api/creator", { body: { op: "characters", scenarioId: id, request } }) });
  const start = useMutation({
    mutationFn: () => api<{ id: string }>("/api/stories", { body: { scenarioId: id, character: { name, fields, attributeAllocation: allocation, visualProfile: visual } } }),
    onSuccess: ({ id: storyId }) => router.push(`/stories/${storyId}`),
  });

  if (detail.isPending)
    return (
      <Page>
        <LoadingBlock label="Готовим создание персонажа…" />
      </Page>
    );
  if (detail.isError)
    return (
      <Page>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Page>
    );

  const pub = detail.data.public;
  const creation = pub.characterCreation;
  const extraFields = creation.fields.filter((f) => f.id !== "name");
  const pointsLeft = creation.attributePoints - Object.values(allocation).reduce((a, b) => a + b, 0);
  const missing = extraFields.filter((f) => f.required && !fields[f.id]?.trim()).map((f) => f.label);
  const pick = (c: Candidate) => {
    setName(c.name);
    setFields((prev) => {
      const next = { ...prev };
      for (const f of extraFields) {
        const v = c.fields[f.id];
        if (v && (f.type !== "select" || f.options.some((o) => o.value === v))) next[f.id] = v;
      }
      return next;
    });
  };

  return (
    <Page>
      <PageTitle title="Создание персонажа" subtitle={`${pub.metadata.title} — кем вы войдёте в эту историю?`} />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <Field label="Имя">
            <input className="input text-base" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как зовут героя?" />
          </Field>
          {extraFields.map((f) => (
            <CharacterFieldInput key={f.id} field={f} value={fields[f.id] ?? ""} onChange={(v) => setFields((prev) => ({ ...prev, [f.id]: v }))} />
          ))}

          {creation.attributePoints > 0 && pub.attributes.length > 0 && (
            <section className="panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="label mb-0">Распределение очков</h2>
                <span className={cx("text-sm", pointsLeft === 0 ? "text-jade" : "text-ember")}>Осталось: {pointsLeft}</span>
              </div>
              <div className="space-y-2">
                {pub.attributes.map((a) => {
                  const added = allocation[a.id] ?? 0;
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm" title={a.description}>
                        {a.name}
                      </span>
                      <button type="button" className="btn-quiet" disabled={added === 0} onClick={() => setAllocation((p) => ({ ...p, [a.id]: added - 1 }))} aria-label={`Уменьшить ${a.name}`}>
                        −
                      </button>
                      <span className="w-10 text-center tabular-nums">{a.default + added}</span>
                      <button type="button" className="btn-quiet" disabled={pointsLeft <= 0} onClick={() => setAllocation((p) => ({ ...p, [a.id]: added + 1 }))} aria-label={`Увеличить ${a.name}`}>
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <details className="panel p-4">
            <summary className="cursor-pointer text-sm text-mist">Визуальный профиль (для иллюстраций)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {VISUAL_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input className="input" value={visual[key] ?? ""} onChange={(e) => setVisual((p) => ({ ...p, [key]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </details>

          {start.isError && <ErrorState error={start.error} title="Не удалось начать историю" />}
          {missing.length > 0 && <p className="text-sm text-ember">Заполните: {missing.join(", ")}</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={!name.trim() || missing.length > 0 || pointsLeft < 0 || start.isPending}>
            {start.isPending ? (
              <>
                <Spinner /> Открываем мир…
              </>
            ) : (
              "Начать историю"
            )}
          </button>
        </form>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="font-serif text-lg">✨ Персонаж от AI</h2>
            <p className="mt-1 text-sm text-mist">Опишите, кого хотите сыграть, или оставьте поле пустым. AI предложит трёх героев, подходящих под правила мира.</p>
            <textarea className="input mt-3 min-h-20" placeholder="Например: тихий книжный червь с опасным секретом" value={request} onChange={(e) => setRequest(e.target.value)} />
            <button className="btn-ghost mt-2 w-full" disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? (
                <>
                  <Spinner /> Придумываем…
                </>
              ) : (
                "Сгенерировать варианты"
              )}
            </button>
            {generate.isError && <div className="mt-3"><ErrorState error={generate.error} onRetry={() => generate.mutate()} /></div>}
          </div>
          {generate.data?.characters.map((c, i) => (
            <div key={`${c.name}-${i}`} className="panel animate-fade-in p-4">
              <p className="font-serif text-lg">{c.name}</p>
              <p className="mt-1 text-sm text-mist">{c.summary}</p>
              <button className="btn-quiet mt-2 text-aether" onClick={() => pick(c)}>
                Выбрать этого героя
              </button>
            </div>
          ))}
          {creation.specialTraits.length > 0 && (
            <div className="panel p-4 text-sm">
              <h3 className="label">Особенности старта</h3>
              <ul className="list-disc space-y-1 pl-5 text-mist">
                {creation.specialTraits.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}

function CharacterFieldInput({ field, value, onChange }: { field: CharacterField; value: string; onChange: (v: string) => void }) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "select") {
    return (
      <fieldset>
        <legend className="label">{label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options.map((o) => (
            <button
              type="button"
              key={o.value}
              onClick={() => onChange(o.value)}
              className={cx("rounded-xl border p-3 text-left transition", value === o.value ? "border-aether/70 bg-aether/10" : "border-white/10 bg-ink-900/60 hover:border-white/20")}
            >
              <span className="block text-sm font-medium">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-xs text-mist">{o.description}</span>}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <Field label={label}>
      {field.type === "textarea" ? (
        <textarea className="input min-h-24" value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" type={field.type === "number" ? "number" : "text"} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
