import { describe, expect, it } from "vitest";
import { createAetherfallAcademy } from "../src/demo/aetherfallAcademy";
import { addMinutes, fromMinutes, toMinutes, timeOfDay } from "../src/domain/time";
import { slugify, uniqueId } from "../src/domain/common";

describe("domain", () => {
  it("demo scenario parses with defaults", () => {
    const s = createAetherfallAcademy();
    expect(s.metadata.title).toBe("Aetherfall Academy");
    expect(s.mechanics.relationshipAxes.length).toBeGreaterThan(5);
    expect(s.abilities.find((a) => a.id === "mana-bolt")?.requirements.stats).toEqual({});
  });

  it("time round-trips and rolls over months", () => {
    const cal = createAetherfallAcademy().calendar;
    const t = { year: 1247, month: 1, day: 30, hour: 23, minute: 30 };
    expect(fromMinutes(toMinutes(t, cal), cal)).toEqual(t);
    expect(addMinutes(t, 60, cal)).toEqual({ year: 1247, month: 2, day: 1, hour: 0, minute: 30 });
    expect(timeOfDay({ ...t, hour: 8 }, cal)).toBe("morning");
  });

  it("slugify handles cyrillic and collisions", () => {
    expect(slugify("Огненный шар")).toBe("ognennyy-shar");
    expect(uniqueId("Огненный шар", ["ognennyy-shar"])).toBe("ognennyy-shar-2");
  });
});
