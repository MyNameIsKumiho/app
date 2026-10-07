import { z } from "zod";
import { db } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { deleteScenario, getScenarioDetail, setLibraryFlags, updateScenario } from "@/server/scenarios";

export const GET = route<IdParams>(async (_request, { params }) => getScenarioDetail(db(), (await params).id));

const UpdateSchema = z.object({ scenario: z.unknown() });

export const PUT = route<IdParams>(async (request, { params }) => {
  const { scenario } = UpdateSchema.parse(await readJson(request));
  return updateScenario(db(), (await params).id, scenario);
});

const FlagsSchema = z.object({ inLibrary: z.boolean().optional(), favorite: z.boolean().optional() });

export const PATCH = route<IdParams>(async (request, { params }) => setLibraryFlags(db(), (await params).id, FlagsSchema.parse(await readJson(request))));

export const DELETE = route<IdParams>(async (_request, { params }) => {
  deleteScenario(db(), (await params).id);
  return { ok: true };
});
