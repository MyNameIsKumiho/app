import { z } from "zod";
import { db, settings } from "@/server/context";
import { readJson, route } from "@/server/http";
import { createScenario, listScenarios } from "@/server/scenarios";

const ScopeSchema = z.enum(["explore", "library", "mine", "favorites"]).catch("explore");

export const GET = route(async (request) => {
  const url = new URL(request.url);
  return listScenarios(db(), { scope: ScopeSchema.parse(url.searchParams.get("scope")), q: url.searchParams.get("q") ?? undefined, tag: url.searchParams.get("tag") ?? undefined });
});

const CreateSchema = z.object({ title: z.string().max(200).optional(), data: z.unknown().optional() });

export const POST = route(async (request) => {
  const body = CreateSchema.parse(await readJson(request));
  return createScenario(db(), { title: body.title, data: body.data, authorName: settings().profile.authorName });
});
