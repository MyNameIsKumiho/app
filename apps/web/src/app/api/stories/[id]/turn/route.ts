import { z } from "zod";
import { deps } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { playStoryTurn } from "@/server/stories";

export const maxDuration = 300;

const TurnSchema = z.object({ action: z.unknown(), replaceTurnId: z.string().min(1).optional() });

export const POST = route<IdParams>(async (request, { params }) => {
  const { action, replaceTurnId } = TurnSchema.parse(await readJson(request));
  return playStoryTurn(deps(), (await params).id, action, { replaceTurnId });
});
