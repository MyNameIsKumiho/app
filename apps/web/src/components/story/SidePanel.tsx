"use client";

import { useState } from "react";
import type { ActionPart } from "@aetherfall/core";
import { formatMinutes } from "@/lib/actions";
import { slotLabel, type PlayerView } from "@/lib/playerView";
import { EmptyState, Meter, cx } from "@/components/ui";

type TabId = "overview" | "stats" | "abilities" | "inventory" | "equipment" | "relations" | "quests" | "system" | "knowledge" | "journal" | "timeline";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "stats", label: "Характеристики" },
  { id: "abilities", label: "Способности" },
  { id: "inventory", label: "Инвентарь" },
  { id: "equipment", label: "Экипировка" },
  { id: "relations", label: "Отношения" },
  { id: "quests", label: "Задания" },
  { id: "system", label: "Система" },
  { id: "knowledge", label: "Знания" },
  { id: "journal", label: "Журнал" },
  { id: "timeline", label: "Хронология" },
];

export interface SidePanelProps {
  view: PlayerView;
  onStage: (part: ActionPart) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
  noteBusy: boolean;
}

export function SidePanel(props: SidePanelProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const tabs = props.view.system.enabled ? TABS : TABS.filter((t) => t.id !== "system");
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-white/[0.06] p-3">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={cx("rounded-lg px-2 py-1 text-xs transition", tab === t.id ? "bg-aether/15 text-parchment" : "text-mist hover:bg-white/5")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {tab === "overview" && <Overview view={props.view} />}
        {tab === "stats" && <Stats view={props.view} />}
        {tab === "abilities" && <Abilities {...props} />}
        {tab === "inventory" && <Inventory {...props} />}
        {tab === "equipment" && <Equipment {...props} />}
        {tab === "relations" && <Relations view={props.view} />}
        {tab === "quests" && <Quests view={props.view} />}
        {tab === "system" && <SystemTab view={props.view} />}
        {tab === "knowledge" && <Knowledge view={props.view} />}
        {tab === "journal" && <Journal {...props} />}
        {tab === "timeline" && <Timeline view={props.view} />}
      </div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 mb-2 text-[11px] font-semibold tracking-[0.15em] text-fog uppercase first:mt-0">{children}</h3>;
}

function Resources({ view }: { view: PlayerView }) {
  return (
    <div className="space-y-2">
      {view.player.resources.map((r, i) => (
        <div key={r.id}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{r.name}</span>
            <span className="text-mist tabular-nums">
              {r.current}/{r.max}
            </span>
          </div>
          <Meter value={r.current} max={r.max} tone={i === 0 ? "rose" : "aether"} label={r.name} />
        </div>
      ))}
    </div>
  );
}

function Overview({ view }: { view: PlayerView }) {
  const active = view.quests.filter((q) => q.status === "active");
  return (
    <div>
      <p className="font-serif text-xl">{view.player.name}</p>
      <p className="text-xs text-mist">
        {view.system.enabled && view.system.modules.levels ? `Уровень ${view.player.level} · ` : ""}
        {view.player.fields.map((f) => f.value).slice(0, 2).join(" · ")}
      </p>
      {!view.alive && <p className="mt-2 rounded-lg bg-rose/10 px-3 py-2 text-rose">Герой погиб.</p>}
      <div className="mt-4">
        <Resources view={view} />
      </div>
      <H>Сейчас</H>
      <p>{view.time}</p>
      <p className="mt-1">
        <span className="text-mist">Место:</span> {view.location.name}
        {view.location.region && <span className="text-fog"> · {view.location.region}</span>}
      </p>
      <p className="mt-1 text-xs text-mist">{view.location.description}</p>
      <p className="mt-1 text-xs text-fog">
        Сцена: {view.scene.title} · Арка: {view.scene.arc}
      </p>
      <H>Рядом</H>
      {view.present.length === 0 ? (
        <p className="text-mist">Никого.</p>
      ) : (
        <ul className="space-y-1">
          {view.present.map((p) => (
            <li key={p.id}>
              {p.name} <span className="text-xs text-fog">· {p.mood}</span>
            </li>
          ))}
        </ul>
      )}
      {view.player.effects.length > 0 && (
        <>
          <H>Эффекты</H>
          <ul className="space-y-1">
            {view.player.effects.map((e) => (
              <li key={e.id} title={e.description}>
                {e.name} {e.remaining && <span className="text-xs text-fog">· {e.remaining}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <H>Активные задания</H>
      {active.length === 0 ? <p className="text-mist">Нет активных заданий.</p> : active.map((q) => <p key={q.id}>• {q.title}</p>)}
      {view.player.currency.length > 0 && (
        <>
          <H>Деньги</H>
          {view.player.currency.map((c) => (
            <p key={c.id}>
              {c.name}: <span className="text-ember tabular-nums">{c.amount}</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function Stats({ view }: { view: PlayerView }) {
  const p = view.player;
  return (
    <div>
      <Resources view={view} />
      {view.system.enabled && view.system.modules.levels && (
        <>
          <H>Уровень {p.level}</H>
          <Meter value={p.xp} max={p.xpToNext} tone="jade" label="Опыт" />
          <p className="mt-1 text-xs text-mist">
            Опыт {p.xp}/{p.xpToNext}
            {p.skillPoints > 0 && ` · очки навыков: ${p.skillPoints}`}
            {p.attributePoints > 0 && ` · очки характеристик: ${p.attributePoints}`}
          </p>
        </>
      )}
      <H>Характеристики</H>
      {p.stats.length === 0 && <p className="text-mist">В этом мире нет числовых характеристик.</p>}
      <dl className="space-y-1.5">
        {p.stats.map((s) => (
          <div key={s.id} className="flex justify-between" title={s.description}>
            <dt>{s.name}</dt>
            <dd className="tabular-nums">
              {s.value}
              {s.value !== s.base && <span className="ml-1 text-xs text-jade">({s.value > s.base ? "+" : ""}{s.value - s.base})</span>}
            </dd>
          </div>
        ))}
      </dl>
      {p.fields.length > 0 && (
        <>
          <H>Персонаж</H>
          {p.fields.map((f) => (
            <p key={f.label} className="mb-1">
              <span className="text-mist">{f.label}:</span> {f.value}
            </p>
          ))}
        </>
      )}
      {(p.titles.length > 0 || p.achievements.length > 0) && (
        <>
          <H>Титулы и достижения</H>
          {[...p.titles, ...p.achievements].map((t) => (
            <span key={t} className="chip mr-1 mb-1">
              {t}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

function Abilities({ view, onStage }: SidePanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  if (view.abilities.length === 0) return <EmptyState title="Нет способностей" text="Их можно получить по ходу истории." />;
  const cats = view.abilityCategories.filter((c) => view.abilities.some((a) => a.category === c.id));
  const list = view.abilities.filter((a) => (!category || a.category === category) && a.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <input className="input mb-2" placeholder="Поиск способностей" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mb-3 flex flex-wrap gap-1">
        <button className={cx("chip cursor-pointer", !category && "chip-active")} onClick={() => setCategory(null)}>
          Все
        </button>
        {cats.map((c) => (
          <button key={c.id} className={cx("chip cursor-pointer", category === c.id && "chip-active")} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className="panel-raised p-3">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-fog">{a.categoryLabel}</span>
            </div>
            <p className="mt-1 text-xs text-mist">{a.description}</p>
            <div className="mt-2">
              <Meter value={a.mastery} max={100} tone="aether" label="Мастерство" />
            </div>
            <p className="mt-1 text-xs text-fog">
              Мастерство {a.mastery}% · стоимость {a.energyCost}
              {a.cooldown > 0 && ` · КД ${formatMinutes(a.cooldown)}`}
              {a.readyIn > 0 && <span className="text-ember"> · через {formatMinutes(a.readyIn)}</span>}
            </p>
            {!a.passive && !a.blocker && (
              <button className="btn-quiet mt-1 text-xs text-aether" onClick={() => onStage({ kind: "ability", abilityId: a.id })}>
                + В ход
              </button>
            )}
            {a.blocker && !a.passive && <p className="mt-1 text-xs text-rose/80">{a.blocker}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Inventory({ view, onStage }: SidePanelProps) {
  const [query, setQuery] = useState("");
  if (view.inventory.length === 0) return <EmptyState title="Инвентарь пуст" />;
  const list = view.inventory.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <input className="input mb-3" placeholder="Поиск предметов" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="space-y-2">
        {list.map((i) => (
          <div key={i.id} className="panel-raised p-3">
            <p className="font-medium">
              {i.name} {i.quantity > 1 && <span className="text-fog">×{i.quantity}</span>}
              {i.equipped && <span className="chip ml-2">надето</span>}
              {i.improvised && <span className="chip ml-2">найдено</span>}
            </p>
            <p className="mt-1 text-xs text-mist">{i.description}</p>
            <div className="mt-1 flex gap-1">
              {i.slot ? (
                <button className="btn-quiet text-xs text-aether" onClick={() => onStage({ kind: "item", itemId: i.id, mode: i.equipped ? "unequip" : "equip" })}>
                  {i.equipped ? "Снять" : "Надеть"}
                </button>
              ) : (
                <button className="btn-quiet text-xs text-aether" onClick={() => onStage({ kind: "item", itemId: i.id, mode: "use" })}>
                  Использовать
                </button>
              )}
              <button className="btn-quiet text-xs" onClick={() => onStage({ kind: "item", itemId: i.id, mode: "show" })}>
                Показать
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Equipment({ view, onStage }: SidePanelProps) {
  return (
    <div className="space-y-2">
      {view.equipment.map((e) => (
        <div key={e.slot} className="panel-raised flex items-center justify-between p-3">
          <div>
            <p className="text-xs text-fog">{slotLabel(e.slot)}</p>
            <p>{e.name ?? <span className="text-mist">—</span>}</p>
          </div>
          {e.itemId && (
            <button className="btn-quiet text-xs" onClick={() => onStage({ kind: "item", itemId: e.itemId!, mode: "unequip" })}>
              Снять
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Relations({ view }: { view: PlayerView }) {
  if (view.relationships.length === 0) return <EmptyState title="Пока ни с кем не знакомы" text="Отношения появятся, когда герой с кем-то познакомится." />;
  return (
    <div className="space-y-3">
      {view.relationships.map((r) => (
        <div key={r.npcId} className="panel-raised p-3">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-fog">Настроение: {r.mood}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {r.axes.map((a) => (
              <div key={a.label} className="contents">
                <dt className="text-mist">{a.label}</dt>
                <dd>{a.level}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {view.factions.length > 0 && (
        <>
          <H>Фракции</H>
          {view.factions.map((f) => (
            <p key={f.id} className="flex justify-between">
              <span>{f.name}</span>
              <span className="text-mist">{f.standing}</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}

const QUEST_STATUS: Record<string, string> = { active: "Активно", completed: "Выполнено", failed: "Провалено" };

function Quests({ view }: { view: PlayerView }) {
  if (view.quests.length === 0) return <EmptyState title="Заданий нет" />;
  return (
    <div className="space-y-3">
      {view.quests.map((q) => (
        <div key={q.id} className={cx("panel-raised p-3", q.status !== "active" && "opacity-70")}>
          <div className="flex justify-between gap-2">
            <p className="font-medium">{q.title}</p>
            <span className={cx("text-xs", q.status === "completed" ? "text-jade" : q.status === "failed" ? "text-rose" : "text-ember")}>{QUEST_STATUS[q.status]}</span>
          </div>
          <p className="mt-1 text-xs text-mist">{q.description}</p>
          <ul className="mt-2 space-y-1 text-xs">
            {q.objectives.map((o) => (
              <li key={o.id} className={cx(o.done && "text-fog line-through")}>
                {o.done ? "☑" : "☐"} {o.description}
                {o.optional && <span className="text-fog"> (необяз.)</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SystemTab({ view }: { view: PlayerView }) {
  const s = view.system;
  return (
    <div>
      <div className="system-window mt-0">
        <p className="font-medium">[{s.name}]</p>
        <p className="mt-1 text-system/80">{s.description}</p>
      </div>
      <p className="mt-3">
        Уровень {view.player.level} · опыт {view.player.xp}/{view.player.xpToNext}
      </p>
      {s.achievements.length > 0 && (
        <>
          <H>Достижения</H>
          {s.achievements.map((a) => (
            <p key={a.name} className={cx("mb-1", !a.owned && "text-fog")}>
              {a.owned ? "★" : "☆"} {a.name} <span className="text-xs text-fog">— {a.description}</span>
            </p>
          ))}
        </>
      )}
      {s.titles.length > 0 && (
        <>
          <H>Титулы</H>
          {s.titles.map((t) => (
            <p key={t.name} className={cx("mb-1", !t.owned && "text-fog")}>
              {t.owned ? "◆" : "◇"} {t.owned ? t.name : "???"}
            </p>
          ))}
        </>
      )}
      {s.shop.length > 0 && (
        <>
          <H>Магазин Системы</H>
          {s.shop.map((i) => (
            <p key={i.itemId} className="flex justify-between">
              <span>{i.name}</span>
              <span className="text-ember">
                {i.price} {i.currency}
              </span>
            </p>
          ))}
          <p className="mt-1 text-xs text-fog">Чтобы купить, напишите об этом в ходе: «Покупаю … в магазине Системы».</p>
        </>
      )}
    </div>
  );
}

const SOURCE: Record<string, string> = { start: "с начала", canon: "знание канона", learned: "узнал", deduced: "догадка", system: "Система" };

function Knowledge({ view }: { view: PlayerView }) {
  return (
    <div>
      <H>Что знает герой</H>
      {view.knowledge.length === 0 && <p className="text-mist">Пока ничего особенного.</p>}
      <ul className="space-y-2">
        {view.knowledge.map((k) => (
          <li key={k.id}>
            {k.text} <span className="text-xs text-fog">· {SOURCE[k.source] ?? k.source}</span>
          </li>
        ))}
      </ul>
      {view.secrets.length > 0 && (
        <>
          <H>Секреты героя</H>
          {view.secrets.map((s) => (
            <div key={s.id} className="panel-raised mb-2 p-3">
              <p>{s.description}</p>
              <p className="mt-1 text-xs text-fog">{s.knownBy.length === 0 ? "Никто не знает" : `Знают: ${s.knownBy.join(", ")}`}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const KIND: Record<string, string> = { event: "Событие", person: "Персонаж", location: "Место", secret: "Тайна", quest: "Задание", system: "Система" };

function Journal({ view, onAddNote, onDeleteNote, noteBusy }: SidePanelProps) {
  const [note, setNote] = useState("");
  return (
    <div>
      <H>Мои заметки</H>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          onAddNote(note);
          setNote("");
        }}
      >
        <input className="input" placeholder="Записать мысль…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-ghost" disabled={noteBusy || !note.trim()}>
          +
        </button>
      </form>
      {view.notes.map((n) => (
        <div key={n.id} className="group mb-2 flex justify-between gap-2 rounded-lg bg-ember/[0.06] px-3 py-2">
          <p>{n.text}</p>
          <button className="text-xs text-fog opacity-0 group-hover:opacity-100 hover:text-rose" onClick={() => onDeleteNote(n.id)} aria-label="Удалить заметку">
            ✕
          </button>
        </div>
      ))}
      <H>Летопись</H>
      {view.journal.length === 0 && <p className="text-mist">Журнал пуст.</p>}
      <ul className="space-y-2">
        {view.journal.map((j) => (
          <li key={j.id}>
            <span className="text-xs text-fog">
              {KIND[j.kind] ?? j.kind} · ход {j.turn}
            </span>
            <p>{j.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TIMELINE_STATUS: Record<string, string> = { pending: "впереди", occurred: "произошло", modified: "изменено", cancelled: "не случилось" };

function Timeline({ view }: { view: PlayerView }) {
  return (
    <div>
      <p className="mb-3 text-xs text-fog">Известные герою события. Ваши действия могут изменить ход истории.</p>
      <ol className="space-y-2 border-l border-white/10 pl-4">
        {view.timeline.map((t) => (
          <li key={t.id} className="relative">
            <span className={cx("absolute top-1.5 -left-[21px] size-2 rounded-full", t.status === "occurred" ? "bg-jade" : t.status === "cancelled" ? "bg-rose" : t.status === "modified" ? "bg-ember" : "bg-ink-600")} />
            <p>{t.title}</p>
            <p className="text-xs text-fog">
              {t.date} · {TIMELINE_STATUS[t.status] ?? t.status}
            </p>
            {t.note && <p className="text-xs text-mist">{t.note}</p>}
          </li>
        ))}
      </ol>
      {view.divergences.length > 0 && (
        <>
          <H>Расхождения с исходной историей</H>
          {view.divergences.map((d) => (
            <p key={d.id} className="mb-1 text-ember">
              ⚑ {d.description} <span className="text-xs text-fog">(ход {d.turn})</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}
