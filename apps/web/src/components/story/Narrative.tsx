"use client";

import { memo } from "react";
import { PART_ICON, describePart } from "@/lib/actions";
import type { PlayerView } from "@/lib/playerView";
import type { TurnDTO } from "@/lib/types";
import { Spinner, cx } from "@/components/ui";

/** Splits narrative into prose paragraphs and System windows ("[...]" lines). */
function Prose({ text }: { text: string }) {
  const blocks = text
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="prose-story">
      {blocks.map((block, i) =>
        /^\[.*\]$/s.test(block) ? (
          <div key={i} className="system-window">
            {block.slice(1, -1)}
          </div>
        ) : (
          <p key={i} className={cx(block.startsWith("—") && "pl-1 text-parchment")}>
            {block}
          </p>
        ),
      )}
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
}: {
  turn: TurnDTO;
  view: PlayerView;
  isHead: boolean;
  debug: boolean;
  onRewind: (turn: TurnDTO) => void;
  onIllustrate: (turn: TurnDTO) => void;
  illustrating: boolean;
  canIllustrate: boolean;
}) {
  return (
    <article className="group animate-fade-in">
      {turn.action && (
        <div className="mb-3 flex flex-wrap justify-end gap-1.5">
          {turn.action.parts.map((p, i) => (
            <span key={i} className="rounded-xl border border-aether/25 bg-aether/[0.08] px-3 py-1.5 text-sm text-parchment/90">
              <span aria-hidden className="mr-1.5 text-aether">
                {PART_ICON[p.kind]}
              </span>
              {describePart(p, view)}
            </span>
          ))}
        </div>
      )}
      {turn.imageId && <img src={`/api/images/${turn.imageId}`} alt="Иллюстрация сцены" className="mb-4 w-full rounded-xl border border-white/10" loading="lazy" />}
      <Prose text={turn.narrative} />
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
