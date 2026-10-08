"use client";

import { memo, useState } from "react";
import type { ActionPart } from "@aetherfall/core";
import { PART_ICON, describePart } from "@/lib/actions";
import type { PlayerView } from "@/lib/playerView";
import type { TurnDTO } from "@/lib/types";
import { Spinner, cx } from "@/components/ui";

/** A character line: "@Имя (роль): «текст»" (also tolerates "**Имя**: текст"). */
const SPEAKER_LINE = /^(?:@\s*([^:()\n]{1,60}?)|\*\*([^*:()\n]{1,60}?)\*\*)\s*(?:\(([^)\n]{1,60})\))?\s*:\s*([\s\S]+)$/;

function hueOf(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function SpeakerLine({ name, role, text, hero }: { name: string; role?: string; text: string; hero: boolean }) {
  const hue = hueOf(name);
  const color = hero ? "var(--color-aether)" : `hsl(${hue} 70% 72%)`;
  return (
    <div
      className={cx("my-3 rounded-lg border-l-2 px-4 py-2 font-sans", hero && "ml-6")}
      style={{ borderColor: color, background: hero ? "color-mix(in oklab, var(--color-aether) 7%, transparent)" : `hsl(${hue} 60% 50% / 0.07)` }}
    >
      <p className="mb-0.5 text-xs font-semibold tracking-wide" style={{ color }}>
        {name}
        {role && <span className="ml-1.5 font-normal opacity-70">· {role}</span>}
      </p>
      <p className="font-serif text-parchment">{text}</p>
    </div>
  );
}

/** Splits narrative into prose paragraphs, character lines and System windows ("[...]" lines). */
function Prose({ text, heroName }: { text: string; heroName: string }) {
  const blocks = text
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="prose-story">
      {blocks.map((block, i) => {
        if (/^\[.*\]$/s.test(block))
          return (
            <div key={i} className="system-window">
              {block.slice(1, -1)}
            </div>
          );
        const speaker = SPEAKER_LINE.exec(block);
        if (speaker) {
          const name = (speaker[1] ?? speaker[2] ?? "").trim();
          return <SpeakerLine key={i} name={name} role={speaker[3]?.trim()} text={speaker[4]!.trim()} hero={name.toLowerCase() === heroName.toLowerCase()} />;
        }
        return (
          <p key={i} className={cx(block.startsWith("—") && "pl-1 text-parchment")}>
            {block}
          </p>
        );
      })}
    </div>
  );
}

const TEXT_KINDS = new Set(["say", "do", "think", "free"]);
const TEXT_LABELS: Record<string, string> = { say: "Сказать", do: "Действие", think: "Мысль", free: "Свободно" };

/** Inline editor for the player's own action: text parts are editable, other parts can be removed. */
function ActionEditor({ parts, view, isHead, busy, onCancel, onSave }: { parts: ActionPart[]; view: PlayerView; isHead: boolean; busy: boolean; onCancel: () => void; onSave: (parts: ActionPart[]) => void }) {
  const [draft, setDraft] = useState<ActionPart[]>(parts);
  const valid = draft.length > 0 && draft.every((p) => !("text" in p) || p.text.trim().length > 0);
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-aether/30 bg-aether/[0.05] p-3">
      {draft.map((p, i) =>
        TEXT_KINDS.has(p.kind) && "text" in p ? (
          <label key={i} className="block">
            <span className="text-xs text-fog">
              {PART_ICON[p.kind]} {TEXT_LABELS[p.kind]}
            </span>
            <textarea
              className="input mt-1 min-h-20 w-full resize-y"
              value={p.text}
              onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? ({ ...x, text: e.target.value } as ActionPart) : x)))}
            />
          </label>
        ) : (
          <span key={i} className="mr-1.5 inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-sm">
            {PART_ICON[p.kind]} {describePart(p, view)}
            <button className="btn-quiet px-1 text-xs" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="Убрать">
              ✕
            </button>
          </span>
        ),
      )}
      {!isHead && <p className="text-xs text-ember">Ходы после этого будут заменены новой версией (старые останутся в отменённой ветке).</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-quiet text-sm" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
        <button className="btn-primary text-sm" disabled={!valid || busy} onClick={() => onSave(draft.map((p) => ("text" in p ? ({ ...p, text: p.text.trim() } as ActionPart) : p)))}>
          {busy ? <Spinner className="size-4" /> : "Сохранить и переписать ответ"}
        </button>
      </div>
    </div>
  );
}

function Report({ turn, debug }: { turn: TurnDTO; debug: boolean }) {
  const r = turn.report;
  if (!r) return null;
  const notable = [...r.failures.map((f) => ({ tone: "text-rose", text: f })), ...r.timeline.filter((t) => t.witnessed || t.status === "cancelled").map((t) => ({ tone: "text-ember", text: `${t.title}: ${t.status === "occurred" ? "событие произошло" : "история изменилась"}` }))];
  if (r.levelUps.length > 0) notable.push({ tone: "text-system", text: `Новый уровень: ${r.levelUps.join(", ")}` });
  return (
    <div className="mt-3 space-y-1">
      {notable.map((n, i) => (
        <p key={i} className={cx("text-xs", n.tone)}>
          • {n.text}
        </p>
      ))}
      {debug && (
        <details className="text-xs text-fog">
          <summary className="cursor-pointer">Отчёт движка{turn.ai ? ` · ${turn.ai.providerId} / ${turn.ai.model} · попыток ${turn.ai.attempts} · ~${turn.ai.contextTokens} ток.` : ""}</summary>
          <div className="mt-1 space-y-0.5 pl-3">
            {r.outcomes.map((o, i) => (
              <p key={`o${i}`}>✓ {o}</p>
            ))}
            {r.applied.map((a, i) => (
              <p key={`a${i}`}>+ {a}</p>
            ))}
            {r.rejected.map((x, i) => (
              <p key={`r${i}`} className="text-rose/80">
                ✕ {x.kind}: {x.reason}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export const TurnCard = memo(function TurnCard({
  turn,
  view,
  isHead,
  debug,
  onRewind,
  onIllustrate,
  illustrating,
  canIllustrate,
  onEdit,
  editBusy,
}: {
  turn: TurnDTO;
  view: PlayerView;
  isHead: boolean;
  debug: boolean;
  onRewind: (turn: TurnDTO) => void;
  onIllustrate: (turn: TurnDTO) => void;
  illustrating: boolean;
  canIllustrate: boolean;
  onEdit: (turn: TurnDTO, parts: ActionPart[]) => void;
  editBusy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <article className="group animate-fade-in">
      {turn.action && editing && (
        <ActionEditor
          parts={turn.action.parts}
          view={view}
          isHead={isHead}
          busy={editBusy}
          onCancel={() => setEditing(false)}
          onSave={(parts) => onEdit(turn, parts)}
        />
      )}
      {turn.action && !editing && (
        <div className="mb-3 flex flex-wrap justify-end gap-1.5">
          {turn.action.parts.map((p, i) => (
            <span key={i} className="rounded-xl border border-aether/25 bg-aether/[0.08] px-3 py-1.5 text-sm text-parchment/90">
              <span aria-hidden className="mr-1.5 text-aether">
                {PART_ICON[p.kind]}
              </span>
              {describePart(p, view)}
            </span>
          ))}
          <button className="btn-quiet px-2 text-xs opacity-60 hover:opacity-100" onClick={() => setEditing(true)} title="Изменить сообщение, и рассказчик перепишет ответ" aria-label="Изменить сообщение">
            ✎
          </button>
        </div>
      )}
      {turn.imageId && <img src={`/api/images/${turn.imageId}`} alt="Иллюстрация сцены" className="mb-4 w-full rounded-xl border border-white/10" loading="lazy" />}
      <Prose text={turn.narrative} heroName={view.player.name} />
      <Report turn={turn} debug={debug} />
      <div className="mt-2 flex gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
        {!isHead && (
          <button className="btn-quiet text-xs" onClick={() => onRewind(turn)}>
            ⟲ Вернуться к этому моменту
          </button>
        )}
        {canIllustrate && !turn.imageId && (
          <button className="btn-quiet text-xs" disabled={illustrating} onClick={() => onIllustrate(turn)}>
            {illustrating ? <Spinner className="size-3" /> : "🖼"} Иллюстрировать
          </button>
        )}
      </div>
    </article>
  );
});

export function PendingTurn({ parts, view }: { parts: TurnDTO["action"]; view: PlayerView }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex flex-wrap justify-end gap-1.5">
        {parts?.parts.map((p, i) => (
          <span key={i} className="rounded-xl border border-aether/25 bg-aether/[0.08] px-3 py-1.5 text-sm opacity-80">
            {describePart(p, view)}
          </span>
        ))}
      </div>
      <div role="status" className="flex items-center gap-3 text-mist">
        <Spinner className="text-aether" />
        <span className="font-serif italic">История продолжается…</span>
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-3.5 w-11/12" />
        <div className="skeleton h-3.5 w-10/12" />
        <div className="skeleton h-3.5 w-8/12" />
      </div>
    </div>
  );
}
