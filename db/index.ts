import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialization: Promise<void> | undefined;

function getBinding() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) {
    throw new Error("The local workload database is unavailable.");
  }
  return binding;
}

export function getDb() {
  return drizzle(getBinding(), { schema });
}

export async function ensureDatabase() {
  if (!initialization) {
    const d1 = getBinding();
    initialization = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS work_items (
          id TEXT PRIMARY KEY NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'asana',
          official_title TEXT NOT NULL,
          display_title TEXT NOT NULL,
          title_overridden INTEGER NOT NULL DEFAULT 0,
          official_due_on TEXT,
          landing_start TEXT,
          landing_end TEXT,
          landing_overridden INTEGER NOT NULL DEFAULT 0,
          scheduling_state TEXT NOT NULL DEFAULT 'not_reviewed',
          scheduling_summary TEXT NOT NULL DEFAULT '',
          scheduling_options TEXT NOT NULL DEFAULT '[]',
          scheduling_owner TEXT,
          scheduling_source_url TEXT,
          prep_days INTEGER NOT NULL DEFAULT 3,
          primary_area TEXT NOT NULL DEFAULT 'Needs tagging',
          supporting_areas TEXT NOT NULL DEFAULT '[]',
          request_type TEXT,
          requester TEXT,
          priority TEXT,
          size_band TEXT,
          summary TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          asana_url TEXT,
          slack_url TEXT,
          obsidian_url TEXT,
          source_payload TEXT NOT NULL DEFAULT '{}',
          archived INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          last_synced_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS blackouts (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          start_on TEXT NOT NULL,
          end_on TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        )`),
        d1.prepare(
          "CREATE INDEX IF NOT EXISTS idx_work_items_active_landing ON work_items(archived, landing_start)"
        ),
        d1.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_slack_url ON work_items(slack_url) WHERE slack_url IS NOT NULL AND slack_url <> ''"
        ),
        d1.prepare("PRAGMA optimize"),
      ])
      .then(async () => {
        const columns = await d1
          .prepare("PRAGMA table_info(work_items)")
          .all<{ name: string }>();
        const existingColumns = new Set(columns.results.map((column) => column.name));
        const additions = [
          ["scheduling_state", "TEXT NOT NULL DEFAULT 'not_reviewed'"],
          ["scheduling_summary", "TEXT NOT NULL DEFAULT ''"],
          ["scheduling_options", "TEXT NOT NULL DEFAULT '[]'"],
          ["scheduling_owner", "TEXT"],
          ["scheduling_source_url", "TEXT"],
          ["completed_at", "TEXT"],
        ] as const;
        for (const [name, definition] of additions) {
          if (!existingColumns.has(name)) {
            await d1.prepare(`ALTER TABLE work_items ADD COLUMN ${name} ${definition}`).run();
          }
        }
      });
  }
  return initialization;
}
