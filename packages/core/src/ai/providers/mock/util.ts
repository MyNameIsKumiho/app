/** Deterministic helpers so the mock produces the same output for the same input. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: readonly T[], seed: string): T {
  const item = items[hash(seed) % items.length];
  if (item === undefined) throw new Error("pick() on empty list");
  return item;
}

export function stems(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 4)
      .map((w) => w.slice(0, 5)),
  );
}

export function overlap(a: string, b: string): number {
  const sa = stems(a);
  return [...stems(b)].filter((w) => sa.has(w)).length;
}

export function quoteShort(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
