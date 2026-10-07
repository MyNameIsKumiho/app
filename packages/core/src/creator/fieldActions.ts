/** "✨ Помочь с AI" actions available on every large editor field. */
export const FIELD_ACTION_LABELS = {
  help: "✨ Помочь с AI",
  expand: "Расширить",
  rewrite: "Переписать",
  ideas: "Идеи",
  contradictions: "Найти противоречия",
  balance: "Баланс",
  detail: "Подробнее",
  simplify: "Упростить",
  alternatives: "Альтернативы",
} as const;
export type FieldAction = keyof typeof FIELD_ACTION_LABELS;
