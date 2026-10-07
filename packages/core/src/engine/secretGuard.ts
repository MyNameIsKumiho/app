import type { GameState } from "../domain/gameState";

export interface SecretLeak {
  secretId: string;
  keyword: string;
  excerpt: string;
}

/** Spoken lines in Russian/English prose: dash-led dialogue lines and quoted speech. */
export function extractDialogue(narrative: string): string[] {
  const lines = narrative.split(/\n+/).map((l) => l.trim());
  const dashLines = lines.filter((l) => /^[—–-]\s?/.test(l));
  const quoted = [...narrative.matchAll(/«([^»]{2,})»|"([^"]{2,})"|“([^”]{2,})”/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  return [...dashLines, ...quoted].filter(Boolean);
}

/**
 * Detects dialogue that uses a player secret nobody present knows
 * (e.g. an NPC saying "you're from another world" without ever learning it).
 * The secret is allowed when the hero revealed it aloud this turn.
 */
export function detectSecretLeaks(state: GameState, narrative: string, presentNpcIds: string[], heroSpeech: string): SecretLeak[] {
  const dialogue = extractDialogue(narrative);
  const spoken = heroSpeech.toLowerCase();
  const leaks: SecretLeak[] = [];
  for (const secret of state.player.secrets) {
    if (presentNpcIds.some((id) => secret.knownByNpcIds.includes(id))) continue;
    for (const keyword of secret.keywords) {
      const k = keyword.toLowerCase();
      if (k.length < 3 || spoken.includes(k)) continue;
      const line = dialogue.find((d) => d.toLowerCase().includes(k));
      if (line) {
        leaks.push({ secretId: secret.id, keyword, excerpt: line.slice(0, 200) });
        break;
      }
    }
  }
  return leaks;
}
