import { z } from "zod";
import { db, settings } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { remix } from "@/server/scenarios";

const RemixSchema = z.object({ title: z.string().max(200).optional() });

export const POST = route<IdParams>(async (request, { params }) => {
  const body = RemixSchema.parse(await readJson(request));
  return remix(db(), (await params).id, { title: body.title, authorName: settings().profile.authorName });
});
