import { and, asc, eq } from "drizzle-orm";
import { blackouts, settings, workItems } from "../../../db/schema";
import { ensureDatabase, getDb } from "../../../db";
import { initialBlackouts, initialWorkItems } from "./seed";

function parseStringList(value: string) {
  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function presentItem(item: typeof workItems.$inferSelect) {
  return {
    ...item,
    supportingAreas: parseStringList(item.supportingAreas),
    schedulingOptions: parseStringList(item.schedulingOptions),
  };
}

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select({ id: workItems.id }).from(workItems).limit(1);
  if (existing.length === 0) {
    for (const item of initialWorkItems) {
      await db.insert(workItems).values(item).onConflictDoNothing();
    }
  }
  for (const blackout of initialBlackouts) {
    await db.insert(blackouts).values(blackout).onConflictDoNothing();
  }

  const amazonSchedulingPrototype = "amazon-scheduling-prototype-v1";
  const [prototypeApplied] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, amazonSchedulingPrototype))
    .limit(1);
  if (!prototypeApplied) {
    await db
      .update(workItems)
      .set({
        landingStart: "2026-09-09",
        landingEnd: "2026-09-11",
        landingOverridden: true,
        schedulingState: "decision_needed",
        schedulingSummary:
          "September 9–11 was proposed and initially accepted, but September 16 was later raised as an alternative. Brett and Glenn still need to settle the final date.",
        schedulingOptions: JSON.stringify(["September 9–11", "September 16"]),
        schedulingOwner: "Brett + Glenn",
        schedulingSourceUrl:
          "https://figma.slack.com/archives/C0A0F24E6VD/p1786056049520799?thread_ts=1784150798.566769&cid=C0A0F24E6VD",
      })
      .where(eq(workItems.id, "1216609678081043"));
    await db
      .insert(settings)
      .values({ key: amazonSchedulingPrototype, value: new Date().toISOString() })
      .onConflictDoNothing();
  }
}

export async function GET() {
  try {
    await ensureDatabase();
    await seedIfEmpty();
    const db = getDb();
    const [items, blackoutRows] = await Promise.all([
      db
        .select()
        .from(workItems)
        .where(and(eq(workItems.archived, false), eq(workItems.sourceType, "asana")))
        .orderBy(asc(workItems.landingStart), asc(workItems.displayTitle)),
      db.select().from(blackouts).orderBy(asc(blackouts.startOn)),
    ]);
    const env = process.env;
    return Response.json({
      items: items.map(presentItem),
      blackouts: blackoutRows,
      asanaConnected: Boolean(env.ASANA_ACCESS_TOKEN),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workload unavailable";
    return Response.json({ error: message }, { status: 500 });
  }
}

const editableFields = new Set([
  "displayTitle",
  "prepDays",
  "primaryArea",
  "supportingAreas",
  "obsidianUrl",
]);

const asanaSyncedFields = new Set([
  "sourceType",
  "officialTitle",
  "officialDueOn",
  "requestType",
  "requester",
  "priority",
  "sizeBand",
  "summary",
  "asanaUrl",
  "slackUrl",
  "sourcePayload",
  "lastSyncedAt",
]);

export async function PATCH(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as {
      id?: string;
      patch?: Record<string, unknown>;
    };
    if (!payload.id || !payload.patch) {
      return Response.json({ error: "Missing item update" }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(and(eq(workItems.id, payload.id), eq(workItems.sourceType, "asana")))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "Commitment not found" }, { status: 404 });
    }
    if (Object.keys(payload.patch).some((key) => asanaSyncedFields.has(key))) {
      return Response.json({ error: "Asana metadata is read-only" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload.patch)) {
      if (!editableFields.has(key)) continue;
      patch[key] = key === "supportingAreas" ? JSON.stringify(value ?? []) : value;
    }
    if ("displayTitle" in patch) patch.titleOverridden = true;
    patch.updatedAt = new Date().toISOString();

    const [updated] = await db
      .update(workItems)
      .set(patch)
      .where(eq(workItems.id, payload.id))
      .returning();
    if (!updated) {
      return Response.json({ error: "Commitment not found" }, { status: 404 });
    }
    return Response.json({ item: presentItem(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save changes";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();

    if (payload.kind !== "blackout") {
      return Response.json(
        { error: "Commitments can only be added through Asana" },
        { status: 400 }
      );
    }
    if (!payload.label || !payload.startOn || !payload.endOn) {
      return Response.json({ error: "Blackout dates are required" }, { status: 400 });
    }
    const [row] = await db
      .insert(blackouts)
      .values({
        id: crypto.randomUUID(),
        label: String(payload.label),
        startOn: String(payload.startOn),
        endOn: String(payload.endOn),
      })
      .returning();
    return Response.json({ blackout: row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add blackout";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
    if (url.searchParams.get("kind") !== "blackout") {
      return Response.json({ error: "Only blackouts can be removed here" }, { status: 400 });
    }
    const db = getDb();
    await db.delete(blackouts).where(eq(blackouts.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove item";
    return Response.json({ error: message }, { status: 500 });
  }
}
