import { deps } from "@/server/context";
import { loadScenario } from "@/server/scenarios";
import { runCreator } from "@/server/creator";
import { readJson, route } from "@/server/http";

export const maxDuration = 300;

export const POST = route(async (request) => {
  const { ai, db } = deps();
  return runCreator(ai, await readJson(request), (id) => loadScenario(db, id));
});
