"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAIStatus } from "@/components/AIBanner";
import { ErrorState, Field, LoadingBlock, Page, PageTitle, Spinner, Toggle, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { AIStatusDTO } from "@/lib/aiStatus";

interface SettingsDTO {
  ai: { primary: string; fallback: string; temperature: number; contextBudget: number; showDebug: boolean };
  images: { mode: "never" | "manual" | "important" | "frequent"; provider: "auto" | "openai" | "mock" };
  gameplay: { autosave: boolean; autosaveSlots: number; showSuggestions: boolean };
  profile: { authorName: string };
}
type Patch = { [K in keyof SettingsDTO]?: Partial<SettingsDTO[K]> };

const KIND_LABEL = { api: "API-ключ", subscription: "Подписка", mock: "Без AI" } as const;

const IMAGE_MODES = [
  { id: "never", label: "Никогда" },
  { id: "manual", label: "Только по кнопке" },
  { id: "important", label: "Важные сцены" },
  { id: "frequent", label: "Часто" },
] as const;

export default function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsDTO>("/api/settings") });
  const status = useAIStatus();
  const [advanced, setAdvanced] = useState(false);
  const update = useMutation({
    mutationFn: (patch: Patch) => api<SettingsDTO>("/api/settings", { method: "PUT", body: patch }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      void qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
  });

  if (settings.isPending)
    return (
      <Page current="/settings">
        <LoadingBlock />
      </Page>
    );
  if (settings.isError)
    return (
      <Page current="/settings">
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      </Page>
    );
  const s = settings.data;
  const providers = status.data?.providers ?? [];

  return (
    <Page current="/settings">
      <PageTitle title="Настройки" subtitle="Ключи API хранятся только на сервере приложения и никогда не попадают в браузер." actions={update.isPending ? <Spinner className="text-aether" /> : null} />
      {update.isError && (
        <div className="mb-4">
          <ErrorState error={update.error} />
        </div>
      )}

      <section className="panel p-6">
        <h2 className="font-serif text-2xl">AI-рассказчик</h2>
        <ActiveLine status={status.data} loading={status.isPending} />
        {status.isError && <ErrorState error={status.error} onRetry={() => status.refetch()} />}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className={cx("panel-raised p-4", s.ai.primary === p.id && "border-aether/50")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{p.label}</p>
                <span className={cx("chip", p.available ? "border-jade/40 text-jade" : "text-fog")}>{p.available ? "готов" : "недоступен"}</span>
              </div>
              <p className="mt-0.5 text-xs text-fog">{KIND_LABEL[p.kind]}</p>
              <p className="mt-2 text-sm text-mist">{p.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Основной рассказчик" hint="«Автоматически» выбирает первый доступный: Claude, ChatGPT-подписка, OpenAI. Демо-рассказчик используется, только если нет ни одного.">
            <select className="input" value={s.ai.primary} onChange={(e) => update.mutate({ ai: { primary: e.target.value } })}>
              <option value="auto">Автоматически</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.available ? "" : " (недоступен)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Запасной рассказчик" hint="Используется, если основной упёрся в лимит, кончились средства или сервис недоступен.">
            <select className="input" value={s.ai.fallback} onChange={(e) => update.mutate({ ai: { fallback: e.target.value } })}>
              <option value="disabled">Отключён</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <details className="mt-6 rounded-xl border border-white/[0.06] p-4 text-sm">
          <summary className="cursor-pointer font-medium">Как подключить AI</summary>
          <div className="mt-3 space-y-3 text-mist">
            {status.data?.desktopConfigFile ? (
              <p>
                <b className="text-parchment">Где ключи.</b> Откройте файл <code className="break-all">{status.data.desktopConfigFile}</code> в Блокноте, впишите ключи и перезапустите Aetherfall. Файл хранится только на этом компьютере.
              </p>
            ) : null}
            <p>
              <b className="text-parchment">Claude API.</b> Задайте <code>ANTHROPIC_API_KEY</code>
              {status.data?.desktopConfigFile ? " в этом файле" : <> в файле <code>apps/web/.env.local</code></>} и перезапустите приложение. Ключ читается только сервером.
            </p>
            <p>
              <b className="text-parchment">OpenAI API.</b> Аналогично: <code>OPENAI_API_KEY</code>. Этот же ключ используется для иллюстраций.
            </p>
            <p>
              <b className="text-parchment">Подписка ChatGPT (без трат API).</b> Установите официальный Codex CLI (<code>npm i -g @openai/codex</code>), выполните <code>codex login</code> и выберите «Sign in with ChatGPT». Приложение вызывает CLI на этом компьютере, и запросы идут в лимит вашей подписки. Данные входа остаются внутри CLI: приложение их не читает и не хранит. Работает только когда приложение запущено на вашем компьютере.
            </p>
            <p>
              <b className="text-parchment">Подписка Claude.</b> Anthropic запрещает использовать вход по подписке Claude (Pro/Max) в сторонних приложениях, поэтому здесь доступен только Claude по API-ключу.
            </p>
          </div>
        </details>

        <button className="btn-quiet mt-4" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
          {advanced ? "▾" : "▸"} Расширенные настройки
        </button>
        {advanced && (
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <Field label={`Креативность: ${s.ai.temperature.toFixed(2)}`} hint="Ниже — предсказуемее, выше — смелее. Некоторые модели игнорируют этот параметр.">
              <input type="range" min={0} max={1} step={0.05} defaultValue={s.ai.temperature} className="w-full accent-aether" onMouseUp={(e) => update.mutate({ ai: { temperature: Number(e.currentTarget.value) } })} onKeyUp={(e) => update.mutate({ ai: { temperature: Number(e.currentTarget.value) } })} />
            </Field>
            <Field label="Бюджет контекста (токенов)" hint="Сколько памяти истории отправлять рассказчику за ход. Больше — дороже и медленнее.">
              <select className="input" value={s.ai.contextBudget} onChange={(e) => update.mutate({ ai: { contextBudget: Number(e.target.value) } })}>
                {[4000, 6000, 8000, 12000, 20000, 32000].map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString("ru-RU")}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle checked={s.ai.showDebug} onChange={(v) => update.mutate({ ai: { showDebug: v } })} label="Показывать отчёт движка под ходами" description="Какая модель ответила, что применено и что отклонено валидатором." />
            {status.data && status.data.recentEvents.length > 0 && (
              <div className="text-xs text-mist md:col-span-2">
                <p className="label">Последние вызовы AI</p>
                {status.data.recentEvents.map((e, i) => (
                  <p key={i}>
                    {new Date(e.at).toLocaleTimeString("ru-RU")} · {e.providerId} · {e.ok ? "успех" : `ошибка ${e.code}: ${e.error}`} · {e.ms} мс
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="font-serif text-2xl">Иллюстрации</h2>
        <p className="mt-1 text-sm text-mist">Сейчас рисует: {status.data?.image.label ?? "…"}. Картинки не генерируются на каждый ход: в режиме «Важные сцены» не чаще раза в три хода.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {IMAGE_MODES.map((m) => (
            <button key={m.id} className={cx("chip cursor-pointer px-3 py-1.5", s.images.mode === m.id && "chip-active")} onClick={() => update.mutate({ images: { mode: m.id } })}>
              {m.label}
            </button>
          ))}
        </div>
        <Field label="Источник изображений">
          <select className="input mt-1 max-w-xs" value={s.images.provider} onChange={(e) => update.mutate({ images: { provider: e.target.value as SettingsDTO["images"]["provider"] } })}>
            <option value="auto">Автоматически</option>
            <option value="openai">OpenAI Images</option>
            <option value="mock">Плейсхолдеры без AI</option>
          </select>
        </Field>
      </section>

      <section className="panel mt-6 grid gap-5 p-6 md:grid-cols-2">
        <h2 className="font-serif text-2xl md:col-span-2">Игра и профиль</h2>
        <Toggle checked={s.gameplay.autosave} onChange={(v) => update.mutate({ gameplay: { autosave: v } })} label="Автосохранение после каждого хода" />
        <Toggle checked={s.gameplay.showSuggestions} onChange={(v) => update.mutate({ gameplay: { showSuggestions: v } })} label="Подсказки действий" description="Рассказчик предлагает несколько вариантов, но вы всегда можете сделать что угодно." />
        <Field label="Слотов автосохранения">
          <select className="input" value={s.gameplay.autosaveSlots} onChange={(e) => update.mutate({ gameplay: { autosaveSlots: Number(e.target.value) } })}>
            {[1, 3, 5, 10, 20].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Имя автора" hint="Подписывает ваши сценарии и ремиксы.">
          <input className="input" defaultValue={s.profile.authorName} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value !== s.profile.authorName && update.mutate({ profile: { authorName: e.target.value.trim() } })} />
        </Field>
      </section>
    </Page>
  );
}

function ActiveLine({ status, loading }: { status?: AIStatusDTO; loading: boolean }) {
  if (loading) return <p className="mt-2 text-sm text-mist">Проверяем подключения…</p>;
  if (!status) return null;
  return (
    <p className="mt-2 text-sm">
      Сейчас отвечает: <b className={status.usingMock ? "text-ember" : "text-jade"}>{status.active?.label ?? "никто"}</b>
      {status.fallback && <span className="text-mist"> · запасной: {status.fallback.label}</span>}
      {status.usingMock && <span className="block text-ember/90">Это демо-рассказчик: механика работает, но текст шаблонный. Подключите настоящую модель ниже.</span>}
    </p>
  );
}
