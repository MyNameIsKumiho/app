"use client";

import { useState } from "react";
import { slugify, uniqueId, type Scenario } from "@aetherfall/core";
import type { SectionSpec } from "@/lib/editorSchema";
import { EmptyState, cx } from "@/components/ui";
import { FormFields } from "./FormFields";

type Entity = Record<string, unknown> & { id: string };

export function CollectionEditor({ spec, scenario, revision, onChange }: { spec: NonNullable<SectionSpec["collection"]>; scenario: Scenario; revision: number; onChange: (list: Entity[]) => void }) {
  const list = scenario[spec.key] as unknown as Entity[];
  const [selected, setSelected] = useState<string | null>(list[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const current = list.find((e) => e.id === selected) ?? null;
  const title = (e: Entity) => String(e[spec.nameKey] ?? e.id);
  const filtered = list.filter((e) => title(e).toLowerCase().includes(query.toLowerCase()));

  const add = () => {
    const name = newName.trim() || spec.itemLabel;
    const id = uniqueId(slugify(name, spec.key.slice(0, -1)), list.map((e) => e.id));
    onChange([...list, { ...spec.newItem(id, name), id } as Entity]);
    setSelected(id);
    setNewName("");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <div>
        <div className="flex gap-2">
          <input className="input" placeholder={`Новый: ${spec.itemLabel.toLowerCase()}`} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn-ghost px-3" onClick={add} aria-label="Добавить">
            +
          </button>
        </div>
        {list.length > 6 && <input className="input mt-2" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} />}
        <ul className="mt-3 max-h-[60vh] space-y-0.5 overflow-y-auto">
          {filtered.map((e) => (
            <li key={e.id}>
              <button className={cx("w-full truncate rounded-lg px-3 py-1.5 text-left text-sm", e.id === selected ? "bg-aether/15 text-parchment" : "text-mist hover:bg-white/5")} onClick={() => setSelected(e.id)}>
                {title(e)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        {!current ? (
          <EmptyState title="Ничего не выбрано" text={list.length === 0 ? "Добавьте первый элемент слева." : "Выберите элемент из списка."} />
        ) : (
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-xs text-fog">id: {current.id}</p>
              <button
                className="btn-quiet text-xs text-rose"
                onClick={() => {
                  if (!window.confirm(`Удалить «${title(current)}»? Ссылки на него придётся поправить.`)) return;
                  onChange(list.filter((e) => e.id !== current.id));
                  setSelected(null);
                }}
              >
                Удалить
              </button>
            </div>
            <FormFields key={`${revision}-${current.id}`} fields={spec.fields} value={current} scenario={scenario} onChange={(next) => onChange(list.map((e) => (e.id === current.id ? (next as Entity) : e)))} />
          </div>
        )}
      </div>
    </div>
  );
}
