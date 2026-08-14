import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull().default("asana"),
    officialTitle: text("official_title").notNull(),
    displayTitle: text("display_title").notNull(),
    titleOverridden: integer("title_overridden", { mode: "boolean" })
      .notNull()
      .default(false),
    officialDueOn: text("official_due_on"),
    landingStart: text("landing_start"),
    landingEnd: text("landing_end"),
    landingOverridden: integer("landing_overridden", { mode: "boolean" })
      .notNull()
      .default(false),
    schedulingState: text("scheduling_state").notNull().default("not_reviewed"),
    schedulingSummary: text("scheduling_summary").notNull().default(""),
    schedulingOptions: text("scheduling_options").notNull().default("[]"),
    schedulingOwner: text("scheduling_owner"),
    schedulingSourceUrl: text("scheduling_source_url"),
    prepDays: integer("prep_days").notNull().default(3),
    primaryArea: text("primary_area").notNull().default("Needs tagging"),
    supportingAreas: text("supporting_areas").notNull().default("[]"),
    requestType: text("request_type"),
    requester: text("requester"),
    priority: text("priority"),
    sizeBand: text("size_band"),
    summary: text("summary").notNull().default(""),
    note: text("note").notNull().default(""),
    asanaUrl: text("asana_url"),
    slackUrl: text("slack_url"),
    obsidianUrl: text("obsidian_url"),
    sourcePayload: text("source_payload").notNull().default("{}"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    completedAt: text("completed_at"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_work_items_active_landing").on(table.archived, table.landingStart),
    uniqueIndex("idx_work_items_slack_url")
      .on(table.slackUrl)
      .where(sql`${table.slackUrl} IS NOT NULL AND ${table.slackUrl} <> ''`),
  ]
);

export const blackouts = sqliteTable("blackouts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  startOn: text("start_on").notNull(),
  endOn: text("end_on").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
