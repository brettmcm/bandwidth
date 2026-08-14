import { and, eq, isNull, ne, or } from "drizzle-orm";
import { settings, workItems } from "../../../../db/schema";
import { ensureDatabase, getDb } from "../../../../db";

const ADVOCACY_PROJECT_GID = "1213219404907741";
const DEFAULT_WORKSPACE_GID = "10497086658021";
const WORK_HISTORY_START = "2026-07-06T00:00:00.000Z";
const WORK_HISTORY_CURSOR_KEY = "asana-work-history-cursor-v1";
const HISTORY_OVERLAP_MS = 86_400_000;

type AsanaTask = {
  gid: string;
  name: string;
  due_on?: string | null;
  notes?: string;
  permalink_url?: string;
  completed?: boolean;
  completed_at?: string | null;
  modified_at?: string;
  memberships?: Array<{ project?: { gid?: string } | null }>;
  custom_fields?: Array<{ name?: string; display_value?: string | null }>;
};

type AsanaTaskPage = {
  data?: AsanaTask[];
  next_page?: { offset?: string | null } | null;
};

function customValue(task: AsanaTask, name: string) {
  return task.custom_fields?.find((field) => field.name === name)?.display_value ?? null;
}

function noteValue(notes: string | undefined, label: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function defaultPrepDays(size: string | null) {
  if (size?.startsWith("L")) return 12;
  if (size?.startsWith("M")) return 7;
  return 3;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function historyStart(cursor: string | undefined) {
  if (!cursor) return WORK_HISTORY_START;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return WORK_HISTORY_START;
  const overlapped = new Date(parsed.getTime() - HISTORY_OVERLAP_MS).toISOString();
  return overlapped < WORK_HISTORY_START ? WORK_HISTORY_START : overlapped;
}

function belongsToAdvocacy(task: AsanaTask) {
  return task.memberships?.some(
    (membership) => membership.project?.gid === ADVOCACY_PROJECT_GID
  );
}

async function fetchAsanaTasks(endpoint: URL, token: string) {
  const tasks: AsanaTask[] = [];
  const seenOffsets = new Set<string>();

  while (true) {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const wait = response.headers.get("retry-after");
      const suffix = wait ? ` Try again in ${wait} seconds.` : "";
      throw new Error(`Asana refresh failed (${response.status}).${suffix}`);
    }

    const page = (await response.json()) as AsanaTaskPage;
    tasks.push(...(page.data ?? []));

    const nextOffset = page.next_page?.offset;
    if (!nextOffset || seenOffsets.has(nextOffset)) break;
    seenOffsets.add(nextOffset);
    endpoint.searchParams.set("offset", nextOffset);
  }

  return tasks;
}

export async function POST() {
  try {
    await ensureDatabase();
    const token = process.env.ASANA_ACCESS_TOKEN;
    if (!token) {
      return Response.json(
        { error: "Asana is not connected. Your saved runway is unchanged." },
        { status: 412 }
      );
    }

    const now = new Date();
    const workspace = process.env.ASANA_WORKSPACE_GID ?? DEFAULT_WORKSPACE_GID;
    const endpoint = new URL(
      `https://app.asana.com/api/1.0/workspaces/${workspace}/tasks/search`
    );
    endpoint.searchParams.set("assignee.any", "me");
    endpoint.searchParams.set("projects.any", ADVOCACY_PROJECT_GID);
    endpoint.searchParams.set("completed", "false");
    endpoint.searchParams.set("due_on.after", addDays(now, -30));
    endpoint.searchParams.set("due_on.before", addDays(now, 120));
    endpoint.searchParams.set("limit", "100");
    endpoint.searchParams.set("sort_by", "due_date");
    endpoint.searchParams.set("sort_ascending", "true");
    endpoint.searchParams.set(
      "opt_fields",
      "gid,name,due_on,notes,permalink_url,custom_fields.name,custom_fields.display_value"
    );

    const db = getDb();
    const [historyCursor] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, WORK_HISTORY_CURSOR_KEY))
      .limit(1);
    const historyEndpoint = new URL("https://app.asana.com/api/1.0/tasks");
    historyEndpoint.searchParams.set("assignee", "me");
    historyEndpoint.searchParams.set("workspace", workspace);
    historyEndpoint.searchParams.set(
      "completed_since",
      historyStart(historyCursor?.value)
    );
    historyEndpoint.searchParams.set("limit", "100");
    historyEndpoint.searchParams.set(
      "opt_fields",
      "gid,name,due_on,notes,permalink_url,completed,completed_at,modified_at,memberships.project.gid,custom_fields.name,custom_fields.display_value"
    );

    const historySyncStartedAt = new Date().toISOString();
    const [tasks, historyCandidates] = await Promise.all([
      fetchAsanaTasks(endpoint, token),
      fetchAsanaTasks(historyEndpoint, token),
    ]);
    const syncedAt = new Date().toISOString();
    const activeTaskIds = new Set(tasks.map((task) => task.gid));

    for (const task of tasks) {
      const [existing] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, task.gid))
        .limit(1);
      const size = noteValue(task.notes, "Project size estimate");
      const due = task.due_on ?? null;
      const sourceUpdate = {
        officialTitle: task.name,
        displayTitle: existing?.titleOverridden ? existing.displayTitle : task.name,
        officialDueOn: due,
        landingStart: existing?.landingOverridden ? existing.landingStart : due,
        landingEnd: existing?.landingOverridden ? existing.landingEnd : null,
        landingOverridden: existing?.landingOverridden ?? false,
        requestType: customValue(task, "Activity Type"),
        requester: noteValue(task.notes, "Requester"),
        priority: noteValue(task.notes, "Requester priority level"),
        sizeBand: size?.slice(0, 1) ?? existing?.sizeBand ?? null,
        summary: customValue(task, "Overview") ?? existing?.summary ?? "",
        asanaUrl: task.permalink_url ?? existing?.asanaUrl ?? null,
        slackUrl: customValue(task, "Slack Request Thread") ?? existing?.slackUrl ?? null,
        sourcePayload: JSON.stringify(task),
        lastSyncedAt: syncedAt,
        updatedAt: syncedAt,
        archived: false,
        completedAt: null,
      };

      if (existing) {
        await db.update(workItems).set(sourceUpdate).where(eq(workItems.id, task.gid));
      } else {
        await db.insert(workItems).values({
          id: task.gid,
          sourceType: "asana",
          officialTitle: task.name,
          displayTitle: task.name,
          officialDueOn: due,
          landingStart: due,
          prepDays: defaultPrepDays(size),
          primaryArea: "Needs tagging",
          supportingAreas: "[]",
          ...sourceUpdate,
        });
      }
    }

    const historyTasks = historyCandidates.filter(belongsToAdvocacy);
    for (const task of historyTasks) {
      const [existing] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, task.gid))
        .limit(1);

      if (task.completed && task.completed_at) {
        if (existing) {
          await db
            .update(workItems)
            .set({
              officialTitle: task.name,
              displayTitle: existing.titleOverridden ? existing.displayTitle : task.name,
              asanaUrl: task.permalink_url ?? existing.asanaUrl,
              completedAt: task.completed_at,
              archived: true,
              sourcePayload: JSON.stringify(task),
              updatedAt: syncedAt,
            })
            .where(eq(workItems.id, task.gid));
        } else {
          const size = noteValue(task.notes, "Project size estimate");
          await db.insert(workItems).values({
            id: task.gid,
            sourceType: "asana",
            officialTitle: task.name,
            displayTitle: task.name,
            officialDueOn: task.due_on ?? null,
            landingStart: task.due_on ?? null,
            prepDays: defaultPrepDays(size),
            primaryArea: "Needs tagging",
            supportingAreas: "[]",
            requestType: customValue(task, "Activity Type"),
            requester: noteValue(task.notes, "Requester"),
            priority: noteValue(task.notes, "Requester priority level"),
            sizeBand: size?.slice(0, 1) ?? null,
            summary: customValue(task, "Overview") ?? "",
            asanaUrl: task.permalink_url ?? null,
            completedAt: task.completed_at,
            archived: true,
            sourcePayload: JSON.stringify(task),
            lastSyncedAt: syncedAt,
            updatedAt: syncedAt,
          });
        }
        continue;
      }

      if (
        existing?.completedAt &&
        task.completed === false &&
        task.modified_at &&
        task.modified_at > existing.completedAt
      ) {
        await db
          .update(workItems)
          .set({
            completedAt: null,
            archived: !activeTaskIds.has(task.gid),
            sourcePayload: JSON.stringify(task),
            updatedAt: syncedAt,
          })
          .where(eq(workItems.id, task.gid));
      }
    }

    const archivedItems = await db
      .update(workItems)
      .set({ archived: true, updatedAt: syncedAt })
      .where(
        and(
          eq(workItems.sourceType, "asana"),
          eq(workItems.archived, false),
          or(isNull(workItems.lastSyncedAt), ne(workItems.lastSyncedAt, syncedAt))
        )
      )
      .returning({ id: workItems.id });

    await db
      .insert(settings)
      .values({ key: WORK_HISTORY_CURSOR_KEY, value: historySyncStartedAt })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: historySyncStartedAt },
      });

    return Response.json({
      ok: true,
      count: tasks.length,
      historyCount: historyTasks.filter((task) => task.completed_at).length,
      removedCount: archivedItems.length,
      syncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Asana refresh failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
