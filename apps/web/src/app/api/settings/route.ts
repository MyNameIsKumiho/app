import { db } from "@/server/context";
import { readJson, route } from "@/server/http";
import { readSettings, writeSettings } from "@/server/settings";

export const GET = route(async () => readSettings(db()));

export const PUT = route(async (request) => writeSettings(db(), await readJson(request)));
