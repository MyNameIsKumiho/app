import { z } from "zod";
import { deps } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { illustrateTurn } from "@/server/stories";

export const maxDuration = 300;

const IllustrateSchema = z.object({ turnId: z.string().min(1) });

export const POST = route<IdParams>(async (request, { params }) => illustrateTurn(deps(), (await params).id, IllustrateSchema.parse(await readJson(request)).turnId));
