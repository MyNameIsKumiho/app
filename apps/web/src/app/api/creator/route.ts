import { deps } from "@/server/context";
import { runCreator } from "@/server/creator";
import { readJson, route } from "@/server/http";

export const maxDuration = 300;

export const POST = route(async (request) => runCreator(deps().ai, await readJson(request)));
