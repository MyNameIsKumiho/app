import { z } from "zod";
import { db, settings } from "@/server/context";
import { readJson, route } from "@/server/http";
import { importScenarioFile } from "@/server/scenarios";

const ImportSchema = z.object({ content: z.string().min(2).max(10_000_000) });

export const POST = route(async (request) => {
  const { content } = ImportSchema.parse(await readJson(request));
  return importScenarioFile(db(), content, settings().profile.authorName);
});
