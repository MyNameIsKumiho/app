import { db } from "@/server/context";
import { route, type IdParams } from "@/server/http";
import { getImage } from "@/server/stories";

export const GET = route<IdParams>(async (_request, { params }) => {
  const image = getImage(db(), (await params).id);
  return new Response(new Uint8Array(image.body), { headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=31536000, immutable" } });
});
