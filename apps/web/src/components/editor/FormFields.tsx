"use client";

import { useState } from "react";
import type { Scenario } from "@aetherfall/core";
import { refOptions, type FieldSpec } from "@/lib/editorSchema";
import { getAt, setAt } from "@/lib/paths";
import { cx } from "@/components/ui";
import { AIFieldAssist } from "./AIFieldAssist";

interface Props {
  fields: FieldSpec[];
  /** The object being edited (scenario, or one entity of a collection). */
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  scenario: Scenario;
}

export function FormFields({ fields, value, onChange, scenario }: Props) {
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FieldRow key={f.key} spec={f} value={getAt(value, f.key)} onChange={(v) => onChange(setAt(value, f.key, v))} scenario={scenario} />
      ))}
    </div>
  );
}

function Label({ spec }: { spec: FieldSpec }) {
  return <span className="label">{spec.label}</span>;
}

function Hint({ text }: { text?: string }) {
  return text ? <span className="mt-1 block text-xs text-fog">{text}</span> : null;
}

function FieldRow({ spec, value, onChange, scenario }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; scenario: Scenario }) {
  switch (spec.type) {
    case "text":
    case "textarea": {
      const text = typeof value === "string" ? value : "";
      return (
        <div>
          <div className="flex items-end justify-between gap-2">
            <Label spec={spec} />
            {spec.ai && <AIFieldAssist scenario={scenario} label={spec.label} value={text} onAccept={(t) => onChange(t)} />}
          </div>
          {spec.type === "textarea" ? (
            <textarea className="input min-h-28" value={text} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input className="input" value={text} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value || (spec.key.endsWith("coverImage") || spec.key === "slot" ? undefined : ""))} />
          )}
          <Hint text={spec.hint} />
        </div>
      );
    }
    case "number":
      return (
        <label className="block">
          <Label spec={spec} />
          <input
            className="input max-w-48"
            type="number"
            min={spec.min}
            max={spec.max}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          <Hint text={spec.hint} />
        </label>
      );
    case "bool":
      return (
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1 accent-aether" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>
            <span className="text-sm">{spec.label}</span>
            <Hint text={spec.hint} />
          </span>
        </label>
      );
    case "select":
      return (
        <label className="block">
          <Label spec={spec} />
          <select className="input" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Hint text={spec.hint} />
        </label>
      );
    case "tags":
    case "lines":
      return <ListField spec={spec} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case "ref": {
      const options = refOptions(scenario, spec.ref);
      return (
        <label className="block">
          <Label spec={spec} />
          <select className="input" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
            {(spec.optional || !value) && <option value="">— не выбрано —</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case "refs": {
      const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
      const options = refOptions(scenario, spec.ref);
      return (
        <div>
          <Label spec={spec} />
          {options.length === 0 && <p className="text-xs text-fog">Пока нечего выбрать.</p>}
          <div className="flex flex-wrap gap-1">
            {options.map((o) => (
              <button
                type="button"
                key={o.value}
                className={cx("chip cursor-pointer", selected.has(o.value) && "chip-active")}
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(o.value)) next.delete(o.value);
                  else next.add(o.value);
                  onChange([...next]);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "json":
      return <JsonField spec={spec} value={value} onChange={onChange} />;
    case "objlist":
      return <ObjList spec={spec} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} scenario={scenario} />;
  }
}

function ListField({ spec, value, onChange }: { spec: Extract<FieldSpec, { type: "tags" | "lines" }>; value: string[]; onChange: (v: unknown) => void }) {
  // Local text keeps the author's typing (trailing commas, blank lines); the editor
  // remounts forms when the draft is replaced from outside (AI patch, reload).
  const [text, setText] = useState(value.join(spec.type === "tags" ? ", " : "\n"));
  const commit = (raw: string) => {
    setText(raw);
    onChange(
      raw
        .split(spec.type === "tags" ? /,/ : /\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  };
  return (
    <label className="block">
      <Label spec={spec} />
      {spec.type === "tags" ? (
        <input className="input" value={text} placeholder="через запятую" onChange={(e) => commit(e.target.value)} />
      ) : (
        <textarea className="input min-h-20" value={text} onChange={(e) => commit(e.target.value)} />
      )}
      <Hint text={spec.hint} />
    </label>
  );
}

function JsonField({ spec, value, onChange }: { spec: Extract<FieldSpec, { type: "json" }>; value: unknown; onChange: (v: unknown) => void }) {
  const pretty = (v: unknown) => (v === undefined ? "" : JSON.stringify(v, null, 2));
  const [text, setText] = useState(pretty(value));
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="block">
      <Label spec={spec} />
      <textarea
        className={cx("input min-h-24 font-mono text-xs", error && "border-rose/60")}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(text));
            setError(null);
          } catch {
            setError("Некорректный JSON: изменения не применены");
          }
        }}
      />
      {error ? <span className="mt-1 block text-xs text-rose">{error}</span> : <Hint text={spec.hint} />}
    </label>
  );
}

function ObjList({ spec, value, onChange, scenario }: { spec: Extract<FieldSpec, { type: "objlist" }>; value: Record<string, unknown>[]; onChange: (v: unknown) => void; scenario: Scenario }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label spec={spec} />
        <button
          type="button"
          className="btn-quiet px-2 py-0.5 text-xs text-aether"
          onClick={() => {
            onChange([...value, spec.newItem()]);
            setOpen(value.length);
          }}
        >
          + Добавить
        </button>
      </div>
      {value.length === 0 && <p className="text-xs text-fog">Пусто.</p>}
      <div className="space-y-1.5">
        {value.map((item, i) => {
          const title = String((spec.titleKey && getAt(item, spec.titleKey)) || `#${i + 1}`);
          return (
            <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" className="flex-1 truncate text-left text-sm" onClick={() => setOpen(open === i ? null : i)}>
                  {open === i ? "▾" : "▸"} {title}
                </button>
                <button type="button" className="text-xs text-fog hover:text-rose" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Удалить">
                  ✕
                </button>
              </div>
              {open === i && (
                <div className="border-t border-white/[0.06] p-3">
                  <FormFields fields={spec.fields} value={item} scenario={scenario} onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
