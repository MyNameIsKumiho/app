import { z } from "zod";
import { db } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { createManualSave, listSaves } from "@/server/stories";

export const GET = route<IdParams>(async (_request, { params }) => listSaves(db(), (await params).id));

const SaveSchema = z.object({ slot: z.number().int().min(1).max(20), label: z.string().max(120).optional() });

export const POST = route<IdParams>(async (request, { params }) => createManualSave(db(), (await params).id, SaveSchema.parse(await readJson(request))));
