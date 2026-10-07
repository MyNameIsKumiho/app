import { db } from "@/server/context";
import { route, type IdParams } from "@/server/http";
import { exportScenarioFile } from "@/server/scenarios";

export const GET = route<IdParams>(async (_request, { params }) => {
  const file = exportScenarioFile(db(), (await params).id);
  return new Response(file.content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
});
