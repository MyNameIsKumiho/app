"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AIBanner } from "@/components/AIBanner";
import { ErrorState, LoadingBlock, Page } from "@/components/ui";
import { api } from "@/lib/api";
import type { ScenarioCard, ScenarioDetail } from "@/lib/types";

const DIFFICULTY: Record<string, string> = { story: "Сюжетная", normal: "Обычная", hard: "Сложная", brutal: "Беспощадная" };

export default function ScenarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["scenario", id], queryFn: () => api<ScenarioDetail>(`/api/scenarios/${id}`) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["scenario", id] });
    void qc.invalidateQueries({ queryKey: ["scenarios"] });
  };
  const flags = useMutation({ mutationFn: (body: { inLibrary?: boolean; favorite?: boolean }) => api(`/api/scenarios/${id}`, { method: "PATCH", body }), onSuccess: refresh });
  const remix = useMutation({
    mutationFn: () => api<ScenarioCard>(`/api/scenarios/${id}/remix`, { body: {} }),
    onSuccess: (card) => router.push(`/scenarios/${card.id}/edit`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/scenarios/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      router.push("/library");
    },
  });

  if (detail.isPending)
    return (
      <Page>
        <LoadingBlock label="Открываем сценарий…" lines={5} />
      </Page>
    );
  if (detail.isError)
    return (
      <Page>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Page>
    );

  const { card, public: pub } = detail.data;
  const tagGroups = [
    ["Жанр", pub.tags.genre],
    ["Сеттинг", pub.tags.setting],
    ["Тон", pub.tags.tone],
    ["Темы", pub.tags.themes],
    ["Особенности", pub.tags.features],
    ["Контент", pub.tags.content],
  ] as const;
  const mutationError = flags.error ?? remix.error ?? remove.error;

  return (
    <Page>
      <AIBanner />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <article>
          <p className="text-sm text-fog">
            {card.authorName} · версия {card.version}
            {card.origin === "fan" && pub.metadata.fandom && <> · фанфик по «{pub.metadata.fandom}»</>}
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight">{card.title}</h1>
          {card.basedOn && (
            <p className="mt-2 text-sm text-mist">
              Основано на{" "}
              <Link className="text-aether hover:underline" href={`/scenarios/${card.basedOn.id}`}>
                «{card.basedOn.title ?? card.basedOn.id}»
              </Link>{" "}
              автора {card.basedOn.author}
            </p>
          )}
          <p className="mt-5 text-lg text-parchment/90">{pub.metadata.shortDescription}</p>
          {pub.metadata.fullDescription && <div className="prose-story mt-6 whitespace-pre-line text-base">{pub.metadata.fullDescription}</div>}
          {pub.situation && (
            <section className="panel mt-8 p-5">
              <h2 className="label">Завязка</h2>
              <p className="font-serif">{pub.situation}</p>
            </section>
          )}
          {pub.world.description && (
            <section className="mt-6">
              <h2 className="label">Мир{pub.world.name ? `: ${pub.world.name}` : ""}</h2>
              <p className="whitespace-pre-line text-mist">{pub.world.description}</p>
            </section>
          )}
          {pub.system.enabled && (
            <section className="system-window mt-6">
              <p className="font-medium">[{pub.system.name}]</p>
              {pub.system.description && <p className="mt-1 text-system/80">{pub.system.description}</p>}
            </section>
          )}
          <div className="mt-8 space-y-2">
            {tagGroups
              .filter(([, list]) => list.length > 0)
              .map(([label, list]) => (
                <div key={label} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-28 text-xs text-fog">{label}</span>
                  {list.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              ))}
          </div>
        </article>

        <aside className="space-y-4">
          <div className="panel space-y-2 p-5">
            <Link href={`/scenarios/${id}/new`} className="btn-primary w-full py-3 text-base">
              Играть
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" disabled={flags.isPending} onClick={() => flags.mutate({ inLibrary: !card.inLibrary })}>
                {card.inLibrary ? "✓ В библиотеке" : "В библиотеку"}
              </button>
              <button className="btn-ghost" disabled={flags.isPending} onClick={() => flags.mutate({ favorite: !card.favorite })}>
                {card.favorite ? "★ Избранное" : "☆ В избранное"}
              </button>
            </div>
            <a className="btn-ghost w-full" href={`/api/scenarios/${id}/export`} download>
              Поделиться: экспорт .scenario
            </a>
            {card.isOwn && !card.isBuiltin ? (
              <Link href={`/scenarios/${id}/edit`} className="btn-ghost w-full">
                Редактировать
              </Link>
            ) : null}
            {card.allowRemix && (
              <button className="btn-ghost w-full" disabled={remix.isPending} onClick={() => remix.mutate()}>
                {remix.isPending ? "Создаём копию…" : "Ремикс: своя версия"}
              </button>
            )}
            {!card.isBuiltin && (
              <button
                className="btn-quiet w-full text-rose"
                disabled={remove.isPending}
                onClick={() => window.confirm(card.isOwn ? "Удалить сценарий? Начатые истории продолжат работать." : "Убрать из библиотеки?") && remove.mutate()}
              >
                {card.isOwn ? "Удалить сценарий" : "Убрать из библиотеки"}
              </button>
            )}
            {mutationError && <ErrorState error={mutationError} />}
          </div>
          <div className="panel p-5 text-sm">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-fog">Сложность</dt>
              <dd>{DIFFICULTY[pub.rules.difficulty] ?? pub.rules.difficulty}</dd>
              <dt className="text-fog">Тон</dt>
              <dd>{pub.rules.tone}</dd>
              <dt className="text-fog">Смерть героя</dt>
              <dd>{pub.rules.playerCanDie ? "Возможна" : "Нет"}</dd>
              <dt className="text-fog">Локации</dt>
              <dd>{pub.counts.locations}</dd>
              <dt className="text-fog">Персонажи</dt>
              <dd>{pub.counts.npcs}</dd>
              <dt className="text-fog">Способности</dt>
              <dd>{pub.counts.abilities}</dd>
              <dt className="text-fog">Задания</dt>
              <dd>{pub.counts.quests}</dd>
              <dt className="text-fog">Запусков</dt>
              <dd>{card.plays}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </Page>
  );
}
