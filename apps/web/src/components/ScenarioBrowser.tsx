"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingBlock, Tabs, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { ScenarioCard } from "@/lib/types";

type Scope = "explore" | "library" | "mine" | "favorites";

export function ScenarioBrowser({ scopes, initial }: { scopes: { id: Scope; label: string }[]; initial: Scope }) {
  const [scope, setScope] = useState<Scope>(initial);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const list = useQuery({
    queryKey: ["scenarios", scope, deferredQuery, tag],
    queryFn: () => api<ScenarioCard[]>(`/api/scenarios?${new URLSearchParams({ scope, q: deferredQuery, ...(tag ? { tag } : {}) })}`),
    placeholderData: (prev) => prev,
  });
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of list.data ?? []) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([t]) => t);
  }, [list.data]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {scopes.length > 1 && <Tabs tabs={scopes} value={scope} onChange={setScope} />}
        <input className="input ml-auto max-w-xs" placeholder="Поиск по названию, автору, тегам…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск сценариев" />
      </div>
      {(allTags.length > 0 || tag) && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {tag && (
            <button className="chip chip-active cursor-pointer" onClick={() => setTag(null)}>
              #{tag} ✕
            </button>
          )}
          {allTags
            .filter((t) => t.toLowerCase() !== tag)
            .map((t) => (
              <button key={t} className="chip cursor-pointer hover:text-parchment" onClick={() => setTag(t.toLowerCase())}>
                #{t}
              </button>
            ))}
        </div>
      )}
      {list.isPending && <LoadingBlock label="Ищем сценарии…" />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          title={query || tag ? "Ничего не найдено" : "Здесь пока пусто"}
          text={query || tag ? "Попробуйте другой запрос или уберите фильтр." : "Создайте свой сценарий или добавьте понравившийся из каталога."}
          action={
            <Link href="/create" className="btn-primary">
              Создать сценарий
            </Link>
          }
        />
      )}
      <div className={cx("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", list.isFetching && "opacity-80")}>
        {list.data?.map((c) => <ScenarioTile key={c.id} card={c} />)}
      </div>
    </div>
  );
}

const STATUS: Record<ScenarioCard["status"], string> = { draft: "Черновик", private: "Приватный", published: "Опубликован" };

export function ScenarioTile({ card }: { card: ScenarioCard }) {
  return (
    <Link href={`/scenarios/${card.id}`} className="panel group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-aether/40">
      <div className="relative h-28 bg-gradient-to-br from-aether-deep/30 via-ink-800 to-ember/10">
        {card.coverImage && <img src={card.coverImage} alt="" className="absolute inset-0 size-full object-cover opacity-80" />}
        <div className="absolute top-2 left-2 flex gap-1">
          {card.isBuiltin && <span className="chip bg-ink-950/70">Демо</span>}
          {card.isOwn && <span className="chip bg-ink-950/70">{STATUS[card.status]}</span>}
          {card.origin === "fan" && <span className="chip bg-ink-950/70">Фанфик{card.fandom ? `: ${card.fandom}` : ""}</span>}
        </div>
        {card.favorite && <span className="absolute top-2 right-3 text-ember" aria-label="В избранном">★</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-serif text-lg leading-snug group-hover:text-aether">{card.title}</h3>
        <p className="mt-0.5 text-xs text-fog">
          {card.authorName} · v{card.version}
          {card.basedOn && <> · основано на «{card.basedOn.title ?? card.basedOn.id}»</>}
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-mist">{card.shortDescription || "Без описания"}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          {card.tags.slice(0, 4).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
