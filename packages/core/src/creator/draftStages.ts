/** Steps of an AI scenario draft, shared by the server and the wizard UI. */
export const DRAFT_STAGES = ["world", "cast", "story"] as const;
export type DraftStage = (typeof DRAFT_STAGES)[number];

export const DRAFT_STAGE_LABELS: Record<DraftStage, string> = {
  world: "мир, правила и места",
  cast: "персонажи, фракции и способности",
  story: "квесты, история и первая сцена",
};
