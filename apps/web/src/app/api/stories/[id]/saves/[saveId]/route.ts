import { db } from "@/server/context";
import { route } from "@/server/http";
import { deleteSave, loadSave } from "@/server/stories";

type Params = { params: Promise<{ id: string; saveId: string }> };

/** Load this save into the story. */
export const POST = route<Params>(async (_request, { params }) => {
  const { id, saveId } = await params;
  loadSave(db(), id, saveId);
  return { ok: true };
});

export const DELETE = route<Params>(async (_request, { params }) => {
  const { id, saveId } = await params;
  deleteSave(db(), id, saveId);
  return { ok: true };
});
