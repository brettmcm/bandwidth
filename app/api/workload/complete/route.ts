import { and, eq } from "drizzle-orm";
import { workItems } from "../../../../db/schema";
import { ensureDatabase, getDb } from "../../../../db";

type AsanaErrorResponse = {
  data?: { completed?: boolean; completed_at?: string | null };
  errors?: Array<{ message?: string }>;
};

function asanaErrorMessage(status: number, body: AsanaErrorResponse) {
  const detail = body.errors?.find((error) => error.message)?.message;
  if (status === 401) return "Asana is no longer authorized. Reconnect it and try again.";
  if (status === 403) return "Asana did not allow this task to be completed.";
  return detail ?? `Asana could not complete this task (${status}).`;
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json().catch(() => null)) as { id?: string } | null;
    if (!payload?.id) {
      return Response.json({ error: "Missing task to complete" }, { status: 400 });
    }

    const token = process.env.ASANA_ACCESS_TOKEN;
    if (!token) {
      return Response.json(
        { error: "Asana is not connected. The task was not changed." },
        { status: 412 }
      );
    }

    const db = getDb();
    const [task] = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.id, payload.id),
          eq(workItems.sourceType, "asana"),
          eq(workItems.archived, false)
        )
      )
      .limit(1);
    if (!task) {
      return Response.json({ error: "Commitment not found" }, { status: 404 });
    }

    const endpoint = new URL(
      `https://app.asana.com/api/1.0/tasks/${encodeURIComponent(task.id)}`
    );
    endpoint.searchParams.set("opt_fields", "completed,completed_at");
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { completed: true } }),
    });
    const body = (await response.json().catch(() => ({}))) as AsanaErrorResponse;
    if (!response.ok) {
      return Response.json(
        { error: asanaErrorMessage(response.status, body) },
        { status: response.status }
      );
    }

    const completedAt = body.data?.completed_at ?? new Date().toISOString();
    await db
      .update(workItems)
      .set({ archived: true, completedAt, updatedAt: completedAt })
      .where(eq(workItems.id, task.id));

    return Response.json({ ok: true, completedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete task";
    return Response.json({ error: message }, { status: 500 });
  }
}
