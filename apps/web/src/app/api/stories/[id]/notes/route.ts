import { z } from "zod";
import { db } from "@/server/context";
import { readJson, route, type IdParams } from "@/server/http";
import { addNote, deleteNote } from "@/server/stories";

const NoteSchema = z.object({ text: z.string().min(1).max(4000) });

export const POST = route<IdParams>(async (request, { params }) => {
  addNote(db(), (await params).id, NoteSchema.parse(await readJson(request)).text);
  return { ok: true };
});

const DeleteSchema = z.object({ noteId: z.string().min(1) });

export const DELETE = route<IdParams>(async (request, { params }) => {
  deleteNote(db(), (await params).id, DeleteSchema.parse(await readJson(request)).noteId);
  return { ok: true };
});
