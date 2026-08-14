import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { workItems } from "../../../../db/schema";

const WORK_HISTORY_START_ON = "2026-07-06";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_PADDING_MS = 86_400_000;

function paddedBoundary(value: string, direction: -1 | 1) {
  const instant = new Date(`${value}T00:00:00.000Z`).getTime();
  return new Date(instant + direction * RANGE_PADDING_MS).toISOString();
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const requestedFrom = url.searchParams.get("from") ?? WORK_HISTORY_START_ON;
    const requestedThrough =
      url.searchParams.get("through") ?? new Date().toISOString().slice(0, 10);

    if (
      !ISO_DATE.test(requestedFrom) ||
      !ISO_DATE.test(requestedThrough) ||
      requestedFrom > requestedThrough
    ) {
      return Response.json({ error: "Invalid history date range" }, { status: 400 });
    }

    const from = requestedFrom < WORK_HISTORY_START_ON
      ? WORK_HISTORY_START_ON
      : requestedFrom;
    const completedAfter = paddedBoundary(from, -1);
    const completedBefore = paddedBoundary(requestedThrough, 1);
    const db = getDb();
    const items = await db
      .select({
        id: workItems.id,
        displayTitle: workItems.displayTitle,
        primaryArea: workItems.primaryArea,
        requestType: workItems.requestType,
        asanaUrl: workItems.asanaUrl,
        completedAt: workItems.completedAt,
      })
      .from(workItems)
      .where(
        and(
          eq(workItems.sourceType, "asana"),
          isNotNull(workItems.completedAt),
          gte(workItems.completedAt, completedAfter),
          lte(workItems.completedAt, completedBefore)
        )
      )
      .orderBy(desc(workItems.completedAt), desc(workItems.displayTitle));

    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Work history unavailable";
    return Response.json({ error: message }, { status: 500 });
  }
}
