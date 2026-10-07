"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AIBanner } from "@/components/AIBanner";
import { ErrorState, Page } from "@/components/ui";
import { api } from "@/lib/api";
import type { StoryCard } from "@/lib/types";

const MENU = [
  { href: "/explore", title: "Новая история", text: "Выберите сценарий и создайте героя", glyph: "✧" },
  { href: "/explore", title: "Исследовать", text: "Каталог сценариев, жанры и теги", glyph: "◈" },
  { href: "/library", title: "Библиотека", text: "Сохранённые, избранные и свои миры", glyph: "❖" },
  { href: "/create", title: "Создать", text: "AI-мастер или расширенный редактор", glyph: "✎" },
  { href: "/settings", title: "Настройки", text: "Рассказчик, изображения, сохранения", glyph: "⚙" },
];

export default function HomePage() {
  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api<StoryCard[]>("/api/stories") });
  const latest = stories.data?.[0];

  return (
    <Page current="/">
      <AIBanner />
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-6 py-14 sm:px-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-aether-deep/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 size-72 rounded-full bg-ember/10 blur-3xl" />
        <p className="text-sm tracking-[0.3em] text-aether uppercase">Интерактивные истории</p>
        <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">Ваш выбор пишет историю. Мир помнит каждое слово.</h1>
        <p className="mt-4 max-w-xl text-mist">Говорите, действуйте, молчите, используйте способности. AI-рассказчик ведёт сюжет, а движок следит за правилами, временем и памятью персонажей.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {latest ? (
            <Link href={`/stories/${latest.id}`} className="btn-primary px-6 py-3 text-base">
              Продолжить: {latest.characterName} · {latest.title}
            </Link>
          ) : (
            <Link href="/scenarios/aetherfall-academy" className="btn-primary px-6 py-3 text-base">
              Начать с Aetherfall Academy
            </Link>
          )}
          <Link href="/stories" className="btn-ghost px-5 py-3">
            Все истории
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {MENU.map((m) => (
          <Link key={m.title} href={m.href} className="panel group p-5 transition hover:-translate-y-0.5 hover:border-aether/40">
            <div aria-hidden className="text-2xl text-aether/80 transition group-hover:text-aether">
              {m.glyph}
            </div>
            <h2 className="mt-3 font-serif text-lg">{m.title}</h2>
            <p className="mt-1 text-sm text-mist">{m.text}</p>
          </Link>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="mb-4 font-serif text-2xl">Недавние истории</h2>
        {stories.isPending && <div className="skeleton h-20" />}
        {stories.isError && <ErrorState error={stories.error} onRetry={() => stories.refetch()} />}
        {stories.data && stories.data.length === 0 && <p className="text-mist">Пока ни одной истории. Самое время начать первую.</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {stories.data?.slice(0, 6).map((s) => (
            <Link key={s.id} href={`/stories/${s.id}`} className="panel p-4 transition hover:border-aether/40">
              <p className="text-xs text-fog">{s.title}</p>
              <p className="mt-1 font-serif text-lg">{s.characterName}</p>
              <p className="mt-1 text-sm text-mist">
                Ход {s.turn} · {s.location}
                {!s.alive && <span className="ml-2 text-rose">погиб</span>}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
