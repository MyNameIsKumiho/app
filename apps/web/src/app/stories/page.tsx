"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingBlock, Page, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import type { StoryCard } from "@/lib/types";

export default function StoriesPage() {
  const qc = useQueryClient();
  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api<StoryCard[]>("/api/stories") });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/stories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stories"] }),
  });

  return (
    <Page>
      <PageTitle title="Мои истории" subtitle="Каждая история хранит полную историю ходов, автосохранения и ручные сохранения." />
      {stories.isPending && <LoadingBlock />}
      {stories.isError && <ErrorState error={stories.error} onRetry={() => stories.refetch()} />}
      {remove.isError && <ErrorState error={remove.error} />}
      {stories.data?.length === 0 && (
        <EmptyState
          title="Историй пока нет"
          text="Выберите сценарий в каталоге и создайте героя."
          action={
            <Link href="/explore" className="btn-primary">
              Открыть каталог
            </Link>
          }
        />
      )}
      <div className="space-y-3">
        {stories.data?.map((s) => (
          <div key={s.id} className="panel flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg">
                {s.characterName} <span className="text-mist">· {s.title}</span>
              </p>
              <p className="text-sm text-mist">
                Ход {s.turn} · {s.location} · {new Date(s.updatedAt).toLocaleString("ru-RU")}
                {!s.alive && <span className="ml-2 text-rose">герой погиб</span>}
              </p>
            </div>
            <Link href={`/stories/${s.id}`} className="btn-primary">
              Продолжить
            </Link>
            <button
              className="btn-quiet text-rose"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Удалить историю «${s.characterName}»? Сохранения тоже будут удалены.`)) remove.mutate(s.id);
              }}
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
    </Page>
  );
}
