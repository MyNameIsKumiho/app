import { EMOTIONS, intensityLabel, type ActionPart, type SuggestedAction } from "@aetherfall/core";
import type { PlayerView } from "./playerView";

export const REST_LABELS = { wait: "Ждать", sleep: "Спать", train: "Тренироваться", study: "Учиться" } as const;
export const ITEM_MODE_LABELS = { use: "Использовать", equip: "Надеть / взять в руки", unequip: "Убрать / снять", show: "Показать", give: "Отдать" } as const;

/** Short human description of an action part, as shown in the composer and the story log. */
export function describePart(part: ActionPart, view?: PlayerView): string {
  switch (part.kind) {
    case "say":
      return `«${part.text}»`;
    case "do":
      return part.text;
    case "think":
      return `(мысль) ${part.text}`;
    case "silent":
      return "Молчит";
    case "emotion":
      return `${EMOTIONS.find((e) => e.id === part.emotion)?.label ?? part.emotion}, ${intensityLabel(part.intensity)}`;
    case "ability": {
      const name = view?.abilities.find((a) => a.id === part.abilityId)?.name ?? part.abilityId;
      return `Способность: ${name}${part.target ? ` → ${part.target}` : ""}`;
    }
    case "item": {
      const name = view?.inventory.find((i) => i.id === part.itemId)?.name ?? part.itemId;
      return `${ITEM_MODE_LABELS[part.mode]}: ${name}${part.target ? ` → ${part.target}` : ""}`;
    }
    case "travel":
      return `Путь: ${view?.location.connections.find((c) => c.id === part.locationId)?.name ?? part.locationId}`;
    case "rest":
      return `${REST_LABELS[part.activity]}: ${formatMinutes(part.minutes)}`;
    case "free":
      return part.text;
  }
}

export const PART_ICON: Record<ActionPart["kind"], string> = {
  say: "❝",
  do: "✋",
  think: "💭",
  silent: "…",
  emotion: "♥",
  ability: "✦",
  item: "◆",
  travel: "➜",
  rest: "☾",
  free: "✎",
};

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1440) return `${Math.round((minutes / 60) * 10) / 10} ч`;
  return `${Math.round((minutes / 1440) * 10) / 10} дн`;
}

/** Turns an AI suggestion into an action part the player can review before sending. */
export function suggestionToPart(s: SuggestedAction, view: PlayerView): ActionPart | null {
  const text = s.text || s.label;
  switch (s.kind) {
    case "say":
    case "do":
    case "think":
    case "free":
      return { kind: s.kind, text };
    case "silent":
      return { kind: "silent" };
    case "ability": {
      const ability = view.abilities.find((a) => a.name.toLowerCase() === text.toLowerCase() || a.id === text);
      return ability ? { kind: "ability", abilityId: ability.id } : { kind: "do", text };
    }
    case "item": {
      const item = view.inventory.find((i) => i.name.toLowerCase() === text.toLowerCase() || i.id === text);
      return item ? { kind: "item", itemId: item.id, mode: "use" } : { kind: "do", text };
    }
  }
}
