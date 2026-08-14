import type { InferInsertModel } from "drizzle-orm";
import type { blackouts, workItems } from "../../../db/schema";

type WorkItemSeed = InferInsertModel<typeof workItems>;
type BlackoutSeed = InferInsertModel<typeof blackouts>;

const syncedAt = "2026-08-12T18:20:00.000Z";

export const initialWorkItems: WorkItemSeed[] = [
  {
    id: "1217158585995852",
    sourceType: "asana",
    officialTitle: "Code layers EAP support",
    displayTitle: "Code Layers EAP support",
    titleOverridden: true,
    officialDueOn: "2026-08-17",
    landingStart: "2026-08-17",
    landingOverridden: false,
    prepDays: 7,
    primaryArea: "Code Layers",
    supportingAreas: "[]",
    requestType: "Product support",
    requester: "Mari Kong",
    priority: "High",
    sizeBand: "M",
    summary:
      "Playground file, live onboarding, product feedback, and EAP conversation moderation ahead of open beta.",
    asanaUrl:
      "https://app.asana.com/1/10497086658021/project/1213219404907741/task/1217158585995852",
    slackUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1785858982956559",
    lastSyncedAt: syncedAt,
  },
  {
    id: "1217374443221221",
    sourceType: "asana",
    officialTitle: "Code Layers demo assets",
    displayTitle: "Code Layers demo assets",
    titleOverridden: true,
    officialDueOn: "2026-08-18",
    landingStart: "2026-08-18",
    landingOverridden: false,
    prepDays: 3,
    primaryArea: "Code Layers",
    supportingAreas: "[]",
    requestType: "Demo file",
    requester: "Gerard",
    priority: "Medium",
    sizeBand: "S",
    summary:
      "A compact package of Code Layers resources for solution consultants to use in customer demos.",
    asanaUrl:
      "https://app.asana.com/1/10497086658021/project/1213219404907741/task/1217374443221221",
    slackUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1786466944470329",
    lastSyncedAt: syncedAt,
  },
  {
    id: "1216609678081043",
    sourceType: "asana",
    officialTitle:
      "Amazon (Consolidated) Renewal: Advocate Session, Designer Workflow,AI Driven Workflow",
    displayTitle: "Amazon best-practices session",
    titleOverridden: true,
    officialDueOn: "2026-08-26",
    landingStart: "2026-09-09",
    landingEnd: "2026-09-11",
    landingOverridden: true,
    schedulingState: "decision_needed",
    schedulingSummary:
      "September 9–11 was proposed and initially accepted, but September 16 was later raised as an alternative. Brett and Glenn still need to settle the final date.",
    schedulingOptions: '["September 9–11","September 16"]',
    schedulingOwner: "Brett + Glenn",
    schedulingSourceUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1786056049520799?thread_ts=1784150798.566769&cid=C0A0F24E6VD",
    prepDays: 5,
    primaryArea: "Design Agent",
    supportingAreas: "[]",
    requestType: "Advocate session",
    requester: "Phil Russell",
    priority: "High",
    summary:
      "A customer lunch-and-learn on Design Agent workflows, practical guidance, and open questions.",
    asanaUrl:
      "https://app.asana.com/1/10497086658021/project/1213219404907741/task/1216609678081043",
    slackUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1784150798566769",
    lastSyncedAt: syncedAt,
  },
  {
    id: "1216640731763825",
    sourceType: "asana",
    officialTitle: "Workflow lab: Agent + skills",
    displayTitle: "Workflow Lab: Agent + Skills",
    titleOverridden: true,
    officialDueOn: "2026-09-03",
    landingStart: "2026-09-03",
    prepDays: 7,
    primaryArea: "Design Agent",
    supportingAreas: '["Skills"]',
    requestType: "Content",
    requester: "Anja Laubscher",
    priority: "Medium",
    sizeBand: "M",
    summary:
      "A problem-to-production workflow showing Agent across the platform, with Skills improving the output.",
    asanaUrl:
      "https://app.asana.com/1/10497086658021/project/1213219404907741/task/1216640731763825",
    slackUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1784232900428459",
    lastSyncedAt: syncedAt,
  },
  {
    id: "1216996183940205",
    sourceType: "asana",
    officialTitle: "Release Notes Ep8",
    displayTitle: "Release Notes Ep8",
    titleOverridden: true,
    officialDueOn: "2026-09-30",
    landingStart: "2026-09-30",
    prepDays: 12,
    primaryArea: "Expressive Design",
    supportingAreas: '["Weave Tools"]',
    requestType: "Livestream",
    requester: "Sarah Kelly",
    priority: "Medium",
    sizeBand: "L",
    summary:
      "Host and live-demo support for an expressive-design episode aligned with Weave files in Figma.",
    asanaUrl:
      "https://app.asana.com/1/10497086658021/project/1213219404907741/task/1216996183940205",
    slackUrl:
      "https://figma.slack.com/archives/C0A0F24E6VD/p1785345141042019",
    lastSyncedAt: syncedAt,
  },
];

export const initialBlackouts: BlackoutSeed[] = [
  {
    id: "london-offsite-2026",
    label: "London offsite",
    startOn: "2026-08-24",
    endOn: "2026-08-28",
  },
];
