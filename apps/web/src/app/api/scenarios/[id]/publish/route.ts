import { z } from "zod";
import { db } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { publishScenario } from "@/server/scenarios";

const PublishSchema = z.object({ visibility: z.enum(["published", "private"]), bump: z.enum(["patch", "minor", "major"]).optional() });

export const POST = route<IdParams>(async (request, { params }) => publishScenario(db(), (await params).id, PublishSchema.parse(await readJson(request))));
