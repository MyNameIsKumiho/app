import { z } from "zod";
import { db } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { rewindStory } from "@/server/stories";

const RewindSchema = z.object({ turnId: z.string().min(1) });

export const POST = route<IdParams>(async (request, { params }) => {
  rewindStory(db(), (await params).id, RewindSchema.parse(await readJson(request)).turnId);
  return { ok: true };
});
