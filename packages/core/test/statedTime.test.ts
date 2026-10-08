import { describe, expect, it } from "vitest";
import { statedDurationMinutes } from "../src/engine/statedTime";

describe("statedDurationMinutes", () => {
  it("reads time skips the player states in words", () => {
    expect(statedDurationMinutes("Прошло 12 дней")).toBe(12 * 24 * 60);
    expect(statedDurationMinutes("жду три часа у ворот")).toBe(180);
    expect(statedDurationMinutes("Спустя неделю я вернулся")).toBe(7 * 24 * 60);
    expect(statedDurationMinutes("подожду полчаса")).toBe(30);
  });
  it("ignores durations that are not time passing", () => {
    expect(statedDurationMinutes("Достаю часы и смотрю на них")).toBe(0);
    expect(statedDurationMinutes("Иду на вокзал")).toBe(0);
  });
});
