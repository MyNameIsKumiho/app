export type ImageKind = "scene" | "portrait" | "location" | "cover" | "item";
export type IllustrationMode = "never" | "manual" | "important" | "frequent";

/** Image cadence: never every turn; respects the user's setting. */
export function shouldIllustrate(mode: IllustrationMode, input: { worthy: boolean; turn: number; lastIllustratedTurn: number }): boolean {
  switch (mode) {
    case "never":
    case "manual":
      return false;
    case "important":
      return input.worthy && input.turn - input.lastIllustratedTurn >= 3;
    case "frequent":
      return input.worthy || input.turn - input.lastIllustratedTurn >= 5;
  }
}
