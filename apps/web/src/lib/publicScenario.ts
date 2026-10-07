import type { CharacterField, Scenario } from "@aetherfall/core";

/**
 * Spoiler-free description of a scenario for players: what the store page
 * and character creation need, without NPC secrets, hidden lore or the
 * timeline. Authors get the full scenario only for their own drafts.
 */
export interface PublicScenario {
  id: string;
  version: string;
  metadata: Scenario["metadata"];
  tags: Scenario["tags"];
  world: { name: string; description: string };
  situation: string;
  rules: { tone: string; difficulty: string; playerCanDie: boolean; romance: string; violence: string };
  system: { enabled: boolean; name: string; description: string };
  characterCreation: { fields: CharacterField[]; attributePoints: number; specialTraits: string[] };
  attributes: { id: string; name: string; description: string; default: number; max: number }[];
  counts: { locations: number; npcs: number; abilities: number; items: number; quests: number; lore: number };
}

export function toPublicScenario(s: Scenario): PublicScenario {
  return {
    id: s.id,
    version: s.version,
    metadata: s.metadata,
    tags: s.tags,
    world: { name: s.world.name, description: s.world.description },
    situation: s.start.situation,
    rules: { tone: s.rules.tone, difficulty: s.rules.difficulty, playerCanDie: s.rules.playerCanDie, romance: s.rules.romance, violence: s.rules.violence },
    system: { enabled: s.system.enabled, name: s.system.name, description: s.system.description },
    characterCreation: {
      // Option grants reveal starting abilities/items by id only; names are resolved here.
      fields: s.characterCreation.fields,
      attributePoints: s.characterCreation.attributePoints,
      specialTraits: s.characterCreation.specialTraits,
    },
    attributes: s.mechanics.stats.filter((st) => st.kind === "attribute").map((st) => ({ id: st.id, name: st.name, description: st.description, default: st.default, max: st.max })),
    counts: {
      locations: s.locations.filter((l) => !l.hidden).length,
      npcs: s.npcs.length,
      abilities: s.abilities.filter((a) => !a.hidden).length,
      items: s.items.filter((i) => !i.hidden).length,
      quests: s.quests.filter((q) => !q.hidden).length,
      lore: s.lore.filter((l) => l.visibility === "public").length,
    },
  };
}
