import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { ACTIVE_BUSINESS_COOKIE, requireWorkspaceContext, writeAudit } from "@/lib/workspace";

function activeBusinessResponse(request: Request, body: Record<string, unknown>, organizationId: string, status = 200) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json(body, {
    status,
    headers: { "Set-Cookie": `${ACTIVE_BUSINESS_COOKIE}=${encodeURIComponent(organizationId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` },
  });
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const payload = await request.json() as { name?: string };
    const name = payload.name?.replace(/\s+/g, " ").trim() || "";
    if (name.length < 2 || name.length > 120) return Response.json({ error: "Informe um nome de negócio entre 2 e 120 caracteres." }, { status: 400 });
    const db = getDb();
    const owned = await db.select({ id: organizations.id, name: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, context.userId), eq(memberships.status, "ACTIVE")));
    if (owned.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      return Response.json({ error: "Você já possui um negócio com esse nome." }, { status: 409 });
    }
    const organizationId = crypto.randomUUID();
    await db.batch([
      db.insert(organizations).values({ id: organizationId, name, createdByUserId: context.userId }),
      db.insert(memberships).values({ id: crypto.randomUUID(), organizationId, userId: context.userId, role: "OWNER", status: "ACTIVE" }),
    ]);
    await writeAudit({ ...context, organizationId, role: "OWNER" }, "BUSINESS_CREATED", "organization", organizationId, { name });
    return activeBusinessResponse(request, { id: organizationId, name, active: true }, organizationId, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível criar o novo negócio." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const payload = await request.json() as { organizationId?: string };
    if (!payload.organizationId) return Response.json({ error: "Negócio não informado." }, { status: 400 });
    const [membership] = await getDb().select().from(memberships).where(and(
      eq(memberships.organizationId, payload.organizationId),
      eq(memberships.userId, context.userId),
      eq(memberships.status, "ACTIVE"),
    )).limit(1);
    if (!membership) return Response.json({ error: "Você não tem acesso a este negócio." }, { status: 403 });
    return activeBusinessResponse(request, { organizationId: membership.organizationId, active: true }, membership.organizationId);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível trocar de negócio." }, { status: 500 });
  }
}
