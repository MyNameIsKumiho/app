/** Client-side mirror of the server's AI status (no secrets, only availability). */
export interface AIStatusDTO {
  providers: { id: string; label: string; kind: "api" | "subscription" | "mock"; available: boolean; detail: string }[];
  active: { id: string; label: string; kind: string } | null;
  fallback: { id: string; label: string } | null;
  usingMock: boolean;
  image: { id: string; label: string; mock: boolean };
  recentEvents: { providerId: string; ok: boolean; error?: string; code?: string; ms: number; at: number }[];
}
