"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { AIBanner } from "@/components/AIBanner";
import { ScenarioBrowser } from "@/components/ScenarioBrowser";
import { ErrorState, Page, PageTitle, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { ScenarioCard } from "@/lib/types";

export default function CreatePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const blank = useMutation({ mutationFn: () => api<ScenarioCard>("/api/scenarios", { body: { title: "Новый сценарий" } }), onSuccess: (c) => router.push(`/scenarios/${c.id}/edit`) });
  const importFile = useMutation({
    mutationFn: async (file: File) => api<ScenarioCard>("/api/scenarios/import", { body: { content: await file.text() } }),
    onSuccess: (c) => router.push(`/scenarios/${c.id}`),
  });

  return (
    <Page current="/create">
      <AIBanner />
      <PageTitle title="Создать сценарий" subtitle="Опишите идею своими словами: AI задаст вопросы и соберёт черновик. Или стройте мир вручную в расширенном редакторе." />
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/create/wizard" className="panel group p-6 transition hover:border-aether/50">
          <div className="text-3xl text-aether">✨</div>
          <h2 className="mt-3 font-serif text-xl">AI-мастер</h2>
          <p className="mt-2 text-sm text-mist">Пара предложений об идее, несколько вопросов с вариантами, и готов играбельный черновик: мир, персонажи, способности, система и старт.</p>
        </Link>
        <button className="panel p-6 text-left transition hover:border-aether/50" disabled={blank.isPending} onClick={() => blank.mutate()}>
          <div className="text-3xl text-ember">✎</div>
          <h2 className="mt-3 flex items-center gap-2 font-serif text-xl">Расширенный редактор {blank.isPending && <Spinner />}</h2>
          <p className="mt-2 text-sm text-mist">Пустой сценарий и полный контроль: лор, NPC, фракции, локации, способности, предметы, задания, хронология и правила рассказчика.</p>
        </button>
        <button className="panel p-6 text-left transition hover:border-aether/50" disabled={importFile.isPending} onClick={() => fileRef.current?.click()}>
          <div className="text-3xl text-jade">⇪</div>
          <h2 className="mt-3 flex items-center gap-2 font-serif text-xl">Импорт файла {importFile.isPending && <Spinner />}</h2>
          <p className="mt-2 text-sm text-mist">Откройте файл .scenario, которым с вами поделились. Старые версии формата обновятся автоматически.</p>
          <input
            ref={fileRef}
            type="file"
            accept=".scenario,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFile.mutate(file);
              e.target.value = "";
            }}
          />
        </button>
      </div>
      {(blank.error ?? importFile.error) && (
        <div className="mt-4">
          <ErrorState error={blank.error ?? importFile.error} />
        </div>
      )}
      <h2 className="mt-12 mb-4 font-serif text-2xl">Мои сценарии</h2>
      <ScenarioBrowser scopes={[{ id: "mine", label: "Мои" }]} initial="mine" />
    </Page>
  );
}
