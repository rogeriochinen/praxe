import { getWorkspaceSnapshot, requireWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(await getWorkspaceSnapshot(context));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível carregar o workspace." }, { status: 500 });
  }
}
