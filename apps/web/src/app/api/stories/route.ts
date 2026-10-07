import { z } from "zod";
import { CharacterInputSchema } from "@aetherfall/core";
import { db } from "@/server/context";
import { readJson, route } from "@/server/http";
import { createStory, listStories } from "@/server/stories";

export const GET = route(async () => listStories(db()));

const CreateSchema = z.object({ scenarioId: z.string().min(1), character: CharacterInputSchema });

export const POST = route(async (request) => createStory(db(), CreateSchema.parse(await readJson(request))));
