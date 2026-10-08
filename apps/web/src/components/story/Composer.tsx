"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EMOTIONS, type ActionPart, type EmotionId, type SuggestedAction } from "@aetherfall/core";
import { ITEM_MODE_LABELS, PART_ICON, REST_LABELS, describePart, formatMinutes, suggestionToPart } from "@/lib/actions";
import type { PlayerView } from "@/lib/playerView";
import { Modal, Spinner, cx } from "@/components/ui";

type TextMode = "say" | "do" | "think" | "free";
type Picker = null | "emotion" | "ability" | "item" | "travel" | "rest";

const TEXT_MODES: { id: TextMode; label: string; placeholder: string }[] = [
  { id: "say", label: "Сказать", placeholder: "Что вы говорите вслух?" },
  { id: "do", label: "Действие", placeholder: "Что вы делаете?" },
  { id: "think", label: "Мысль", placeholder: "О чём вы думаете? NPC этого не услышат." },
  { id: "free", label: "Свободно", placeholder: "Опишите что угодно своими словами…" },
];

export interface ComposerProps {
  view: PlayerView;
  staged: ActionPart[];
  onStagedChange: (parts: ActionPart[]) => void;
  suggestions: SuggestedAction[];
  showSuggestions: boolean;
  busy: boolean;
  disabled: boolean;
  onSubmit: (parts: ActionPart[]) => void;
}

export function Composer({ view, staged, onStagedChange, suggestions, showSuggestions, busy, disabled, onSubmit }: ComposerProps) {
  const [mode, setMode] = useState<TextMode>("say");
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<Picker>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const stage = (part: ActionPart) => {
    if (staged.length >= 7) return;
    onStagedChange([...staged, part]);
    setPicker(null);
  };
  const currentParts = (): ActionPart[] => {
    const parts = [...staged];
    if (text.trim()) parts.push({ kind: mode, text: text.trim() });
    return parts;
  };
  const submit = () => {
    const parts = currentParts();
    if (parts.length === 0 || busy || disabled) return;
    onSubmit(parts);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const addText = () => {
    if (!text.trim()) return;
    stage({ kind: mode, text: text.trim() });
    setText("");
    textRef.current?.focus();
  };
  const applySuggestion = (s: SuggestedAction) => {
    const part = suggestionToPart(s, view);
    if (!part) return;
    if ((part.kind === "say" || part.kind === "do" || part.kind === "think" || part.kind === "free") && !text.trim()) {
      setMode(part.kind);
      setText(part.text);
      textRef.current?.focus();
    } else stage(part);
  };
  const active = TEXT_MODES.find((m) => m.id === mode)!;

  return (
    <div className="border-t border-white/[0.06] bg-ink-950/85 px-3 pt-3 pb-4 backdrop-blur-md sm:px-6">
      {showSuggestions && suggestions.length > 0 && !busy && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Подсказки">
          {suggestions.map((s, i) => (
            <button key={`${s.label}-${i}`} className="chip shrink-0 cursor-pointer whitespace-nowrap hover:border-aether/50 hover:text-parchment" onClick={() => applySuggestion(s)}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {staged.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fog">Комбинация:</span>
          {staged.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-aether/30 bg-aether/10 px-2 py-1 text-xs">
              <span aria-hidden className="text-aether">
                {PART_ICON[p.kind]}
              </span>
              {describePart(p, view)}
              <button className="ml-1 text-fog hover:text-rose" aria-label="Убрать" onClick={() => onStagedChange(staged.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1">
        {TEXT_MODES.map((m) => (
          <button key={m.id} className={cx("chip cursor-pointer px-3 py-1", mode === m.id && "chip-active")} onClick={() => setMode(m.id)}>
            {PART_ICON[m.id]} {m.label}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        <button className="chip cursor-pointer px-3 py-1 hover:text-parchment" onClick={() => stage({ kind: "silent" })}>
          … Промолчать
        </button>
        <button className={cx("chip cursor-pointer px-3 py-1 hover:text-parchment", picker === "emotion" && "chip-active")} onClick={() => setPicker(picker === "emotion" ? null : "emotion")}>
          ♥ Эмоция
        </button>
        <button className="chip cursor-pointer px-3 py-1 hover:text-parchment" onClick={() => setPicker("ability")}>
          ✦ Способность
        </button>
        <button className="chip cursor-pointer px-3 py-1 hover:text-parchment" onClick={() => setPicker("item")}>
          ◆ Предмет
        </button>
        <button className={cx("chip cursor-pointer px-3 py-1 hover:text-parchment", picker === "travel" && "chip-active")} onClick={() => setPicker(picker === "travel" ? null : "travel")}>
          ➜ Путь
        </button>
        <button className={cx("chip cursor-pointer px-3 py-1 hover:text-parchment", picker === "rest" && "chip-active")} onClick={() => setPicker(picker === "rest" ? null : "rest")}>
          ☾ Время
        </button>
      </div>

      {picker === "emotion" && <EmotionPicker onPick={stage} />}
      {picker === "travel" && <TravelPicker view={view} onPick={stage} />}
      {picker === "rest" && <RestPicker onPick={stage} />}
      <AbilityPicker open={picker === "ability"} view={view} onClose={() => setPicker(null)} onPick={stage} />
      <ItemPicker open={picker === "item"} view={view} onClose={() => setPicker(null)} onPick={stage} />

      <div className="flex items-end gap-2">
        <textarea
          ref={textRef}
          className="input max-h-48 min-h-12 flex-1 resize-none py-3 text-base"
          rows={1}
          placeholder={disabled ? "История остановлена" : active.placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          aria-label={active.label}
        />
        <button className="btn-ghost h-12" title="Добавить в комбинацию и продолжить" disabled={!text.trim() || busy || disabled} onClick={addText}>
          +
        </button>
        <button className="btn-primary h-12 px-5" disabled={busy || disabled || (staged.length === 0 && !text.trim())} onClick={submit}>
          {busy ? <Spinner /> : "Ход"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-fog">Enter — сделать ход, Shift+Enter — новая строка, «+» — добавить в комбинацию (например: Промолчать + Эмоция + Действие).</p>
    </div>
  );
}

function EmotionPicker({ onPick }: { onPick: (p: ActionPart) => void }) {
  const [intensity, setIntensity] = useState(3);
  return (
    <div className="panel-raised mb-2 animate-fade-in p-3">
      <div className="mb-2 flex items-center gap-3 text-xs text-mist">
        Сила:
        <input type="range" min={1} max={5} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-40 accent-aether" aria-label="Интенсивность эмоции" />
        <span className="tabular-nums">{intensity}/5</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EMOTIONS.map((e) => (
          <button key={e.id} className="chip cursor-pointer hover:border-rose/50 hover:text-parchment" onClick={() => onPick({ kind: "emotion", emotion: e.id as EmotionId, intensity })}>
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TravelPicker({ view, onPick }: { view: PlayerView; onPick: (p: ActionPart) => void }) {
  if (view.location.connections.length === 0) return <p className="panel-raised mb-2 p-3 text-sm text-mist">Отсюда нет известных путей. Можно описать путь словами.</p>;
  return (
    <div className="panel-raised mb-2 flex animate-fade-in flex-wrap gap-1.5 p-3">
      {view.location.connections.map((c) => (
        <button key={c.id} className="chip cursor-pointer hover:text-parchment" onClick={() => onPick({ kind: "travel", locationId: c.id })}>
          {c.name} · {formatMinutes(c.minutes)}
        </button>
      ))}
    </div>
  );
}

function RestPicker({ onPick }: { onPick: (p: ActionPart) => void }) {
  const [activity, setActivity] = useState<keyof typeof REST_LABELS>("wait");
  const [minutes, setMinutes] = useState(60);
  return (
    <div className="panel-raised mb-2 flex animate-fade-in flex-wrap items-center gap-2 p-3 text-sm">
      {(Object.keys(REST_LABELS) as (keyof typeof REST_LABELS)[]).map((a) => (
        <button key={a} className={cx("chip cursor-pointer", activity === a && "chip-active")} onClick={() => setActivity(a)}>
          {REST_LABELS[a]}
        </button>
      ))}
      <select className="input w-auto py-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Длительность">
        {[15, 30, 60, 120, 240, 480, 1440, 4320, 10080].map((m) => (
          <option key={m} value={m}>
            {formatMinutes(m)}
          </option>
        ))}
      </select>
      <button className="btn-ghost py-1" onClick={() => onPick({ kind: "rest", activity, minutes })}>
        Добавить
      </button>
    </div>
  );
}

export function AbilityPicker({ open, view, onClose, onPick }: { open: boolean; view: PlayerView; onClose: () => void; onPick: (p: ActionPart) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const usedCategories = useMemo(() => view.abilityCategories.filter((c) => view.abilities.some((a) => a.category === c.id)), [view]);
  const list = view.abilities.filter((a) => (!category || a.category === category) && `${a.name} ${a.description} ${a.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Способности" wide>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <input className="input max-w-xs" placeholder="Цель (необязательно)" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <button className={cx("chip cursor-pointer", !category && "chip-active")} onClick={() => setCategory(null)}>
          Все
        </button>
        {usedCategories.map((c) => (
          <button key={c.id} className={cx("chip cursor-pointer", category === c.id && "chip-active")} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {view.abilities.length === 0 && <p className="text-sm text-mist">У героя пока нет способностей.</p>}
      {view.abilities.length > 0 && list.length === 0 && <p className="text-sm text-mist">Ничего не найдено.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((a) => (
          <div key={a.id} className={cx("panel-raised p-3", a.blocker && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{a.name}</p>
              <span className="chip shrink-0">{a.categoryLabel}</span>
            </div>
            <p className="mt-1 text-xs text-mist">{a.description}</p>
            <p className="mt-2 text-xs text-fog">
              Мастерство {a.mastery}% · стоимость {a.energyCost}
              {a.cooldown > 0 && ` · перезарядка ${formatMinutes(a.cooldown)}`}
              {a.readyIn > 0 && <span className="text-ember"> · готово через {formatMinutes(a.readyIn)}</span>}
            </p>
            {a.blocker ? (
              <p className="mt-2 text-xs text-rose/90">Нельзя: {a.blocker}</p>
            ) : (
              <button className="btn-quiet mt-1 text-aether" onClick={() => onPick({ kind: "ability", abilityId: a.id, target: target.trim() || undefined })}>
                Применить
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

const ITEM_TYPES: Record<string, string> = { consumable: "Расходники", equipment: "Снаряжение", key: "Ключевые", material: "Материалы", misc: "Разное" };

export function ItemPicker({ open, view, onClose, onPick }: { open: boolean; view: PlayerView; onClose: () => void; onPick: (p: ActionPart) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const list = view.inventory.filter((i) => (!type || i.type === type) && `${i.name} ${i.description}`.toLowerCase().includes(query.toLowerCase()));
  const types = [...new Set(view.inventory.map((i) => i.type))];
  return (
    <Modal open={open} onClose={onClose} title="Инвентарь" wide>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <input className="input max-w-xs" placeholder="Кому / на что (для «Отдать», «Показать»)" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <button className={cx("chip cursor-pointer", !type && "chip-active")} onClick={() => setType(null)}>
          Все
        </button>
        {types.map((t) => (
          <button key={t} className={cx("chip cursor-pointer", type === t && "chip-active")} onClick={() => setType(t)}>
            {ITEM_TYPES[t] ?? t}
          </button>
        ))}
      </div>
      {view.inventory.length === 0 && <p className="text-sm text-mist">Инвентарь пуст.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((i) => {
          const modes: (keyof typeof ITEM_MODE_LABELS)[] = i.equipped ? ["use", "unequip", "show", "give"] : i.slot ? ["equip", "use", "show", "give"] : ["use", "equip", "show", "give"];
          return (
            <div key={i.id} className="panel-raised p-3">
              <p className="font-medium">
                {i.name} {i.quantity > 1 && <span className="text-fog">×{i.quantity}</span>}
                {i.equipped && <span className="chip ml-2">надето</span>}
              </p>
              <p className="mt-1 text-xs text-mist">{i.description}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {modes.map((m) => (
                  <button key={m} className="btn-quiet text-xs text-aether" onClick={() => onPick({ kind: "item", itemId: i.id, mode: m, target: target.trim() || undefined })}>
                    {ITEM_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
