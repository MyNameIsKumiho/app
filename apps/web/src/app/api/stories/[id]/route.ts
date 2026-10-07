import { db, settings } from "@/server/context";
import { route, type IdParams } from "@/server/http";
import { deleteStory, getStoryDetail } from "@/server/stories";

export const GET = route<IdParams>(async (_request, { params }) => getStoryDetail(db(), (await params).id, settings()));

export const DELETE = route<IdParams>(async (_request, { params }) => {
  deleteStory(db(), (await params).id);
  return { ok: true };
});
