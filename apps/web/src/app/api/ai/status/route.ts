import { getAIEnvironment, describeAI } from "@/server/ai";
import { settings } from "@/server/context";
import { route } from "@/server/http";

/** Provider availability for Settings → AI. Contains no keys, only whether one is configured. */
export const GET = route(async () => describeAI(getAIEnvironment(), settings()));
