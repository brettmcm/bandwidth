import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Bandwidth", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Bandwidth<\/title>/i);
  assert.match(html, /Bandwidth/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("removes starter UI and keeps local persistence configured", async () => {
  const [page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<WorkloadClient \/>/);
  assert.match(layout, /Bandwidth/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(hosting, /"d1": "DB"/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("keeps Asana metadata read-only and opens existing tasks in detail mode", async () => {
  const [client, workloadRoute, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /selected && !inspectorEditing/);
  assert.doesNotMatch(client, />Summary<\/h3>/);
  assert.doesNotMatch(client, />Runway plan<\/h3>/);
  assert.doesNotMatch(client, />Asana metadata<\/h3>/);
  assert.match(client, /aria-label="Asana metadata"/);
  assert.match(client, /data-tooltip="This data is synced with Asana"/);
  assert.match(client, /className="source-sync-lock"/);
  const runwayPosition = client.indexOf('aria-label="Runway plan"');
  const summaryPosition = client.indexOf('aria-label="Summary"');
  assert.ok(runwayPosition >= 0 && runwayPosition < summaryPosition);
  assert.match(styles, /\.inspector-section--runway \{[\s\S]*padding-top: 0/);
  assert.match(styles, /\.inspector-section--runway \{[\s\S]*border-top: 0/);
  assert.match(client, /className="quiet-action task-source-edit"/);
  assert.match(client, /form="inspector-edit-form"/);
  assert.match(client, /<form id="inspector-edit-form"/);
  assert.doesNotMatch(client, /Saving…/);
  assert.match(client, /className="task-source-edit-label">Done<\/span>/);
  assert.match(client, /key="edit"[\s\S]*event\.preventDefault\(\)[\s\S]*editInspector\(\)/);
  assert.match(client, /key="done"[\s\S]*form="inspector-edit-form"/);
  assert.doesNotMatch(client, />Cancel<|Save changes|cancelInspectorEdit/);
  assert.match(client, /className="inspector-header-actions"[\s\S]*className="quiet-action task-source-edit"[\s\S]*aria-label="Close inspector"/);
  assert.match(styles, /\.inspector-header-actions \{[\s\S]*top: 16px/);
  assert.match(styles, /\.inspector-header-actions \{[\s\S]*right: 14px/);
  assert.match(styles, /\.inspector-header-actions \{[\s\S]*gap: 0/);
  assert.match(styles, /\.inspector-header-actions \.quiet-action \{[\s\S]*background: transparent/);
  assert.match(styles, /\.inspector-header-actions \.quiet-action:hover \{[\s\S]*background: var\(--surface-subtle\)/);
  assert.match(styles, /\.task-source-edit-label \{[\s\S]*transform: translateY\(1px\)/);
  assert.match(styles, /\.inspector-heading \{[\s\S]*width: 100%/);
  assert.doesNotMatch(client, />Read only</);
  assert.doesNotMatch(client, />Local</);
  assert.match(client, />Slack\.?/);
  assert.match(client, />Obsidian\.?/);
  assert.doesNotMatch(client, /Private note/);
  assert.doesNotMatch(client, /Asana metadata stays read-only/);
  assert.doesNotMatch(client, /Working landing start|Working landing end/);
  assert.doesNotMatch(client, /Calculated schedule|Prep days counted backward from the working landing/);
  assert.match(workloadRoute, /Asana metadata is read-only/);
  assert.doesNotMatch(workloadRoute, /Asana schedules are calculated from due date/);
  assert.match(workloadRoute, /"officialTitle"/);
  assert.match(workloadRoute, /"slackUrl"/);
});

test("completes an Asana task only after a three-second hold", async () => {
  const [client, completeRoute, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/complete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /const HOLD_TO_COMPLETE_MS = 3_000/);
  assert.match(client, /window\.setTimeout\(\(\) => \{[\s\S]*completeAsanaTask\(taskId\)[\s\S]*HOLD_TO_COMPLETE_MS/);
  assert.match(client, /onPointerUp=\{cancelCompletionHold\}/);
  assert.match(client, /onPointerCancel=\{cancelCompletionHold\}/);
  assert.match(client, /event\.key === " " \|\| event\.key === "Enter"/);
  assert.match(client, /: "Mark as done"/);
  assert.equal((client.match(/className="task-complete-action-logo"/g) ?? []).length, 2);
  assert.match(client, /className="task-complete-action-fill" aria-hidden="true"/);
  assert.match(styles, /\.task-complete-action \{[\s\S]*width: 100%/);
  assert.match(styles, /\.task-complete-action \{[\s\S]*border: 1px solid currentColor[\s\S]*background: transparent[\s\S]*color: var\(--interaction\)/);
  assert.match(styles, /\.task-complete-action-logo \{[\s\S]*mask: url\("\/brands\/asana\.svg"\)/);
  assert.match(styles, /\.task-complete-action-fill \{[\s\S]*background: var\(--interaction\)[\s\S]*clip-path: inset\(0 100% 0 0\)[\s\S]*color: var\(--canvas\)/);
  assert.match(styles, /\.task-complete-action--holding \.task-complete-action-fill \{[\s\S]*animation: task-completion-fill 3s linear forwards/);

  assert.match(completeRoute, /https:\/\/app\.asana\.com\/api\/1\.0\/tasks\/\$\{encodeURIComponent\(task\.id\)\}/);
  assert.match(completeRoute, /method: "PUT"/);
  assert.match(completeRoute, /Authorization: `Bearer \$\{token\}`/);
  assert.match(completeRoute, /JSON\.stringify\(\{ data: \{ completed: true \} \}\)/);
  const asanaConfirmed = completeRoute.indexOf("if (!response.ok)");
  const locallyArchived = completeRoute.indexOf(".set({ archived: true, completedAt, updatedAt: completedAt })");
  assert.ok(asanaConfirmed >= 0 && locallyArchived > asanaConfirmed);
});

test("keeps a completed task drawer open and reloads the runway when it closes", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(client, /completionPendingRefreshRef\.current = true;[\s\S]*setCompletionStatus\("completed"\)/);
  assert.match(client, /if \(!open && completionStatus === "submitting"\) return/);
  assert.match(client, /if \(completionPendingRefreshRef\.current\) \{[\s\S]*void load\(\)/);
  assert.doesNotMatch(client, /setCompletionStatus\("completed"\);[\s\S]{0,120}setInspectorOpen\(false\)/);
});

test("does not toast after editing or completing an Asana task", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(client, /toast\.success\("Commitment updated"\)/);
  assert.doesNotMatch(client, /toast\.success\("Completed in Asana"\)/);
  assert.match(client, /toast\.error\(error instanceof Error \? error\.message : "Could not save commitment"\)/);
  assert.match(client, /toast\.error\(error instanceof Error \? error\.message : "Could not complete task"\)/);
});

test("expands project size abbreviations in Asana metadata", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(client, /S: "Small"/);
  assert.match(client, /M: "Medium"/);
  assert.match(client, /L: "Large"/);
  assert.match(client, /XL: "Extra Large"/);
  assert.match(client, /projectSizeLabel\(selected\.sizeBand\)/);
});

test("derives the timeline range from every scheduled task date", async () => {
  const [client, styles, readme] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(client, /const taskDates = timelineItems\.flatMap/);
  assert.match(client, /const earliestTaskDate = taskDates\.reduce/);
  assert.match(client, /const latestTaskDate = taskDates\.reduce/);
  assert.doesNotMatch(client, /HORIZON_DAYS|horizonEnd|horizon-edge|Six-week/);
  assert.doesNotMatch(styles, /horizon-edge/);
  assert.doesNotMatch(readme, /fixed at six weeks|inside the horizon/);
});

test("opens the timeline with the prior week visible", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(client, /const INITIAL_VIEW_LEAD_DAYS = 7;/);
  assert.match(
    client,
    /dayDifference\(timelineStart, timelineToday\) - INITIAL_VIEW_LEAD_DAYS/
  );
});

test("clips weekend bands to the visible timeline range", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(client, /const clippedStart = weekendStart < start \? start : weekendStart;/);
  assert.match(client, /const clippedEnd = weekendEnd > end \? end : weekendEnd;/);
  assert.match(client, /if \(clippedStart < clippedEnd\)/);
  assert.match(client, /ranges\.push\(\{ start: clippedStart, end: clippedEnd \}\)/);
});

test("defaults to Today and switches between runway views", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /type RunwayView = "today" \| "timeline" \| "area" \| "days"/);
  assert.match(client, /useState<RunwayView>\("today"\)/);
  assert.match(client, /aria-controls="today-panel"/);
  assert.match(client, /role="tablist"/);
  assert.match(client, /aria-controls="timeline-panel"/);
  assert.match(client, /aria-controls="area-panel"/);
  assert.match(client, /areaGroups\.map/);
  assert.match(client, /className="area-column"[\s\S]*className="area-column-title"/);
  assert.match(client, /className="area-card"[\s\S]*onClick=\{\(\) => openInspector\(item\.id\)\}/);
  assert.match(client, /item\.requestType \|\| "Support type not set"/);
  assert.doesNotMatch(client, /area-card[\s\S]{0,300}beginCompletionHold/);
  assert.doesNotMatch(client, /area-group-heading|area-row-requester|area-row-date/);
  assert.match(styles, /\.runway-tab--active/);
  assert.match(styles, /\.area-column \{[^}]*padding: 0;/);
  assert.match(styles, /\.area-column \{[\s\S]*background: var\(--surface-subtle\)/);
  assert.match(styles, /\.area-card \{[\s\S]*border: 0;[\s\S]*background: var\(--area-card-surface\)/);
  assert.match(styles, /\.area-card:hover/);
});

test("marks month starts on the timeline while preserving today", async () => {
  const client = await readFile(
    new URL("../app/workload-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(client, /const rulerMarks = \[timelineToday\]/);
  assert.match(client, /rulerCursor\.setDate\(1\)/);
  assert.match(client, /while \(isoDate\(rulerCursor\) <= timelineEnd\)/);
  assert.doesNotMatch(client, /daysUntilMonday/);
  assert.match(client, /mark === timelineToday \? " · today" : ""/);
});

test("supports timeline-only trackpad magnification", async () => {
  const [client, nativeWrapper] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../native/Bandwidth/Sources/Bandwidth/main.swift", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(client, /bandwidth:timeline-magnify/);
  assert.match(client, /const \[timelineDayWidth, setTimelineDayWidth\]/);
  assert.match(client, /canvas\.style\.setProperty\("--timeline-width"/);
  assert.match(client, /flushSync\(\(\) => setTimelineDayWidth/);
  assert.match(client, /phase\?: "began" \| "changed" \| "ended" \| "cancelled"/);
  assert.match(nativeWrapper, /NSMagnificationGestureRecognizer/);
  assert.match(nativeWrapper, /handleTimelineMagnification/);
  assert.match(nativeWrapper, /webView\.isFlipped/);
  assert.match(nativeWrapper, /phase: "\\\(phase\)"/);
});

test("supports grab-to-scroll across a full-width timeline", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /const TIMELINE_DRAG_THRESHOLD = 4/);
  assert.match(client, /onPointerDown=\{beginTimelineDrag\}/);
  assert.match(client, /onPointerMove=\{dragTimeline\}/);
  assert.match(client, /setPointerCapture\(event\.pointerId\)/);
  assert.match(client, /const requestedLeft = drag\.scrollLeft - deltaX/);
  assert.match(client, /const TIMELINE_DECELERATION_RATE = 0\.998/);
  assert.match(client, /drag\.velocityX \* 0\.55 \+ instantVelocityX \* 0\.45/);
  assert.match(client, /Math\.pow\(TIMELINE_DECELERATION_RATE, elapsed\)/);
  assert.match(client, /startTimelineMomentum\(event\.currentTarget, drag, event\.timeStamp\)/);
  assert.match(client, /const TIMELINE_RUBBER_BAND_COEFFICIENT = 0\.55/);
  assert.match(client, /const TIMELINE_EDGE_EPSILON = 0\.5/);
  assert.match(client, /function rubberBandDistance/);
  assert.match(client, /requestedLeft < 0 && scroller\.scrollLeft <= TIMELINE_EDGE_EPSILON/);
  assert.match(client, /requestedLeft > maxLeft &&[\s\S]*scroller\.scrollLeft >= maxLeft - TIMELINE_EDGE_EPSILON/);
  assert.match(client, /rubberBandDerivative\(rawOverscrollX, scroller\.clientWidth\)/);
  assert.match(client, /const springMomentum =/);
  assert.match(client, /Math\.exp\(-TIMELINE_BOUNCE_FREQUENCY \* elapsed\)/);
  assert.match(client, /applyTimelineOverscroll\(event\.currentTarget, drag\.overscrollX\)/);
  assert.match(client, /resetTimelineOverscroll/);
  assert.match(client, /onWheel=\{stopTimelineMomentum\}/);
  assert.match(client, /onClickCapture=\{\(event\) => \{/);
  assert.match(styles, /--runway-inline-padding: clamp\(20px, 3\.2vw, 44px\)/);
  assert.match(styles, /\.timeline-scroller \{[\s\S]*width: calc\([\s\S]*var\(--runway-inline-padding\)[\s\S]*margin-left: calc\(0px - var\(--runway-inline-padding\)\)/);
  assert.match(styles, /\.timeline-scroller--dragging[\s\S]*cursor: grabbing/);
});

test("provides a quiet custom timeline zoom slider", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /className="timeline-zoom-control"/);
  assert.match(client, /type="range"/);
  assert.match(client, /setTimelineZoom/);
  assert.match(
    client,
    /const DEFAULT_TIMELINE_DAY_WIDTH =\s*MIN_TIMELINE_DAY_WIDTH \+\s*\(MAX_TIMELINE_DAY_WIDTH - MIN_TIMELINE_DAY_WIDTH\) \* 0\.5;/
  );
  assert.doesNotMatch(client, /Pinch to zoom/);
  assert.match(styles, /\.timeline-zoom-control input::-webkit-slider-runnable-track/);
  assert.match(styles, /background: var\(--line\)/);
  assert.match(styles, /\.timeline-zoom-control input::-webkit-slider-thumb/);
  assert.match(styles, /width: 8px/);
  assert.match(styles, /background: var\(--interaction\)/);
  assert.match(styles, /color-mix\(in srgb, var\(--interaction\) 14%, transparent\)/);
});

test("defers the client-local calendar date until after hydration", async () => {
  const [client, nativeWrapper] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../native/Bandwidth/Sources/Bandwidth/main.swift", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(client, /const \[today, setToday\] = useState<string \| null>\(null\)/);
  assert.match(client, /setToday\(isoDate\(new Date\(\)\)\)/);
  assert.match(client, /!data \|\| !today/);
  assert.doesNotMatch(client, /useMemo\(\(\) => isoDate\(new Date\(\)\)/);
  assert.match(nativeWrapper, /truncate\(atOffset: 0\)/);
});

test("flags saved landing dates that differ from Asana", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /function hasDateDiscrepancy/);
  assert.match(client, />Dates differ</);
  assert.match(client, />Asana due</);
  assert.match(client, />Saved landing</);
  assert.match(client, /Review Slack thread/);
  assert.match(styles, /\.date-review/);
  assert.match(styles, /\.timeline-card-date-flag/);
});

test("applies a reusable scheduling-decision rule to conversation context", async () => {
  const [client, schema, route, refreshRoute, seed, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/seed.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /schedulingState: text\("scheduling_state"\)/);
  assert.match(schema, /schedulingOptions: text\("scheduling_options"\)/);
  assert.match(client, /function needsSchedulingDecision/);
  assert.match(client, /schedulingState === "decision_needed"/);
  assert.match(client, /timeline-card--decision-needed/);
  assert.match(client, />Date decision needed</);
  assert.match(client, /<small>Owner<\/small>/);
  assert.match(client, /Review Slack thread/);
  assert.match(client, /aria-label="Scheduling decision needed"/);
  assert.match(client, /M8 2 14 13H2L8 2Z/);
  assert.doesNotMatch(client, /timeline-card-decision-flag">Decision needed/);
  const bannerPosition = client.indexOf('className="inspector-decision-banner"');
  const summaryPosition = client.indexOf('aria-label="Summary"');
  assert.ok(bannerPosition >= 0 && bannerPosition < summaryPosition);
  assert.doesNotMatch(
    client,
    /Thread scheduling state|Scheduling summary|Options mentioned|Decision owner|Decision source|Resolve scheduling/
  );
  assert.doesNotMatch(client, /schedule-decision-options|schedule-decision-meta/);
  assert.match(route, /schedulingOptions: parseStringList/);
  const editableFields = route.match(/const editableFields = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
  assert.doesNotMatch(editableFields, /schedulingState|schedulingSummary|schedulingOptions|schedulingOwner|schedulingSourceUrl/);
  assert.match(refreshRoute, /existing\?\.landingOverridden \? existing\.landingStart : due/);
  assert.match(seed, /"September 9–11","September 16"/);
  assert.match(styles, /\.schedule-decision/);
  assert.match(styles, /\.timeline-card-decision-flag/);
  assert.match(styles, /\.timeline-card--decision-needed \.timeline-card-bar/);
  assert.match(styles, /\.timeline-card--decision-needed \.timeline-card-bar::after/);
  assert.doesNotMatch(styles, /timeline-card--tentative|timeline-card--unknown/);
  assert.match(styles, /\.timeline-card-meta > \.timeline-card-decision-flag \{[\s\S]*background: var\(--interaction\)/);
  assert.match(styles, /\.timeline-card-meta > \.timeline-card-decision-flag \{[\s\S]*color: var\(--canvas\)/);
  assert.match(styles, /\.timeline-card-meta > \.timeline-card-decision-flag \{[\s\S]*border-radius: 4px/);
  assert.match(styles, /\.inspector-decision-banner \{[\s\S]*padding: 16px 24px 22px/);
  assert.match(styles, /\.inspector-decision-banner \{[\s\S]*border-top: 0/);
  assert.match(styles, /\.inspector-header:has\(\+ \.inspector-view > \.inspector-decision-banner\)/);
  assert.match(styles, /\.schedule-decision \{[\s\S]*background: var\(--interaction\)/);
  assert.match(styles, /\.schedule-decision \{[\s\S]*color: var\(--canvas\)/);
  assert.match(styles, /\.schedule-decision \{[\s\S]*padding: 18px 18px 16px/);
  assert.match(client, /className="schedule-decision-link"/);
  assert.match(styles, /\.schedule-decision-footer \{[\s\S]*align-items: center/);
  assert.match(styles, /\.schedule-decision-link \{[\s\S]*min-height: 36px/);
  assert.match(styles, /\.schedule-decision-link \{[\s\S]*border-radius: 6px/);
  assert.match(styles, /\.schedule-decision-link \{[\s\S]*background: color-mix\(in srgb, var\(--canvas\) 12%, transparent\)/);
});

test("removes confidence from the active model and editor", async () => {
  const [client, schema, database, route, refreshRoute, seed, styles, migration] =
    await Promise.all([
      readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/workload/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/workload/refresh/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/workload/seed.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0003_nice_power_man.sql", import.meta.url), "utf8"),
    ]);

  for (const source of [client, schema, database, route, refreshRoute, seed]) {
    assert.doesNotMatch(source, /confidence/i);
  }
  assert.doesNotMatch(styles, /timeline-card--tentative|timeline-card--unknown/);
  assert.match(migration, /DROP COLUMN `confidence`/);
});

test("lays out the compact Asana editor in two balanced rows", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /inspector-fields--asana/);
  assert.match(client, /field--runway-name/);
  assert.match(client, /field--prep-compact/);
  assert.match(styles, /\.inspector-fields--asana \{[\s\S]*grid-template-columns: repeat\(6/);
  assert.match(styles, /\.field--runway-name \{[\s\S]*grid-column: span 4/);
  assert.match(styles, /\.field--prep-compact \{[\s\S]*grid-column: span 2/);
});

test("uses Asana as the exclusive commitment source", async () => {
  const [client, route, readme] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(client, /Add commitment|New commitment|Manual commitment|sourceType: "manual"/i);
  assert.match(
    route,
    /where\(and\(eq\(workItems\.archived, false\), eq\(workItems\.sourceType, "asana"\)\)\)/
  );
  assert.doesNotMatch(route, /sourceType: "manual"|`manual:/);
  assert.match(route, /Commitments can only be added through Asana/);
  assert.match(route, /Only blackouts can be removed here/);
  assert.match(readme, /Only Asana tasks appear as commitments/);
});

test("syncs Advocacy tasks regardless of creator", async () => {
  const [refreshRoute, readme] = await Promise.all([
    readFile(new URL("../app/api/workload/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(refreshRoute, /endpoint\.searchParams\.set\("assignee\.any", "me"\)/);
  assert.match(refreshRoute, /endpoint\.searchParams\.set\("projects\.any", ADVOCACY_PROJECT_GID\)/);
  assert.match(refreshRoute, /endpoint\.searchParams\.set\("completed", "false"\)/);
  assert.doesNotMatch(refreshRoute, /created_by\.any|BAILEY_GID/);
  assert.doesNotMatch(readme, /created by Bailey/);
});

test("removes Asana tasks that no longer match the refresh criteria", async () => {
  const [refreshRoute, client] = await Promise.all([
    readFile(new URL("../app/api/workload/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(refreshRoute, /while \(true\)[\s\S]*next_page\?\.offset/);
  assert.match(refreshRoute, /eq\(workItems\.sourceType, "asana"\)/);
  assert.match(refreshRoute, /ne\(workItems\.lastSyncedAt, syncedAt\)/);
  assert.match(refreshRoute, /set\(\{ archived: true, updatedAt: syncedAt \}\)/);
  assert.match(refreshRoute, /removedCount: archivedItems\.length/);
  assert.match(client, /removedCount\?: number/);
});

test("keeps Vaul from capturing pointers from drawer form controls", async () => {
  const [client, days] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/days-view.tsx", import.meta.url), "utf8"),
  ]);

  const rightDrawers = `${client}\n${days}`.match(/<Drawer\.Root[\s\S]*?direction="right"[\s\S]*?>/g) ?? [];
  assert.equal(rightDrawers.length, 3);
  rightDrawers.forEach((drawer) => assert.match(drawer, /\bhandleOnly\b/));
});

test("renders every right-side drawer as a floating panel", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8"
  );

  const drawerPanel = styles.match(/\.drawer-panel \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(drawerPanel, /top: var\(--floating-panel-gap\)/);
  assert.match(drawerPanel, /right: var\(--floating-panel-gap\)/);
  assert.match(drawerPanel, /bottom: var\(--floating-panel-gap\)/);
  assert.match(drawerPanel, /border-radius: var\(--floating-panel-radius\)/);
  assert.match(drawerPanel, /box-shadow: var\(--shadow\)/);
  assert.match(styles, /--floating-panel-gap: 12px/);
  assert.match(styles, /--floating-panel-radius: 8px/);
  assert.match(styles, /\.drawer-panel::after \{\s*display: none/);
  assert.match(styles, /\.inspector-header-actions \.icon-action \{[\s\S]*transform: none/);
});

test("separates planned, reflected, and unstructured Daily Note content", async () => {
  const { countKeyTasks, splitDailyNote, splitMorningBrief, splitTodayPlan } = await import("../app/daily-note.ts");

  assert.deepEqual(
    splitDailyNote("Preface\n\n## Morning Brief\nPlan\n\n## End Of Day Brief\nLearned"),
    { planned: "Plan", reflection: "Learned", fallback: "Preface" }
  );
  assert.deepEqual(splitDailyNote("## Morning Brief\nPlan only"), {
    planned: "Plan only",
    reflection: "",
    fallback: "",
  });
  assert.deepEqual(splitDailyNote("## End Of Day Brief\nReflection only"), {
    planned: "",
    reflection: "Reflection only",
    fallback: "",
  });
  assert.deepEqual(splitDailyNote("# Ops\nRaw note"), {
    planned: "",
    reflection: "",
    fallback: "# Ops\nRaw note",
  });
  assert.deepEqual(splitDailyNote(""), { planned: "", reflection: "", fallback: "" });

  assert.deepEqual(
    splitMorningBrief(`### Primary focus
Today’s primary focus is to **ship the draft**.

### Today’s shape
Focused morning.

### Key tasks
- Draft the artifact.

### Focus profile

#### Overview
It matters today.

#### What success looks like
The draft is sent.`),
    {
      primaryFocus: "Today’s primary focus is to **ship the draft**.",
      focusProfile: "#### Overview\nIt matters today.\n\n#### What success looks like\nThe draft is sent.",
      remaining: "### Today’s shape\nFocused morning.\n\n### Key tasks\n- Draft the artifact.",
    }
  );

  assert.deepEqual(
    splitTodayPlan("### Today’s shape\nYou have a focused morning.\n\n- **Focus: 9:00–11:00am** — Protect this window.\n\n### Key tasks\n- Draft the artifact.\n- Send the review."),
    {
      shape: "You have a focused morning.\n\n- **Focus: 9:00–11:00am** — Protect this window.",
      keyTasks: "- Draft the artifact.\n- Send the review.",
      remaining: "",
    }
  );
  assert.equal(countKeyTasks("- Draft the artifact.\n- Send the review."), 2);
  assert.equal(countKeyTasks("- No eligible tasks surfaced in Reminders or Asana."), 0);
});

test("builds complete Sunday-first calendar months", async () => {
  const { calendarDates, shiftMonth } = await import("../app/calendar.ts");
  const august = calendarDates("2026-08");

  assert.equal(august.length, 42);
  assert.equal(august[0], null);
  assert.equal(august[6], "2026-08-01");
  assert.equal(august[36], "2026-08-31");
  assert.equal(august[41], null);
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("adds a monthly Days calendar and a Completed and Reflection drawer", async () => {
  const [client, days, calendar, markdown, styles] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/days-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/calendar.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/safe-markdown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /type RunwayView = "today" \| "timeline" \| "area" \| "days"/);
  assert.match(client, /const RUNWAY_VIEWS: RunwayView\[\] = \["today", "timeline", "area", "days"\]/);
  assert.match(client, /aria-controls="days-panel"/);
  assert.match(client, /<DaysView/);
  assert.match(client, /<DayRecordDrawer/);
  assert.match(client, /openDayRecord/);
  assert.match(client, /Search commands, commitments, and days/);
  assert.match(days, />Completed</);
  assert.match(days, />Reflection</);
  assert.doesNotMatch(days, />Planned</);
  assert.doesNotMatch(days, />Daily note</);
  assert.match(days, /role="grid"/);
  assert.match(days, /calendar-note-indicator/);
  assert.match(days, /Daily Note logged/);
  assert.match(days, /Drawer\.Root direction="right" handleOnly/);
  assert.match(days, /inspector drawer-panel day-drawer/);
  assert.match(days, /Open in Obsidian/);
  assert.match(days, /day-completed-source-logo" role="img" aria-label="Asana"/);
  assert.match(days, /No Asana-confirmed completions/);
  assert.doesNotMatch(days, /item\.primaryArea/);
  assert.doesNotMatch(days, /item\.requestType/);
  assert.match(calendar, /export const WEEKDAYS/);
  assert.match(calendar, /while \(cells\.length % 7\)/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/);
  assert.match(markdown, /\["https:", "http:", "mailto:", "obsidian:"\]/);
  assert.match(styles, /\.calendar-grid/);
  assert.match(styles, /\.calendar-note-indicator/);
  assert.match(styles, /\.day-drawer-section/);
  assert.match(styles, /\.calendar-day \{[^}]*background: var\(--area-card-surface\)/);
  assert.match(styles, /\.calendar-day--today \{[^}]*border-color:/);
  assert.match(styles, /\.calendar-day-number \{[^}]*top: 10px;[^}]*left: 11px/);
  assert.match(styles, /\.day-completed-list li \{[^}]*align-items: center/);
  assert.match(styles, /\.day-completed-source-logo \{[^}]*width: 10px;[^}]*height: 10px;[^}]*opacity: 0\.25;[^}]*background: var\(--interaction\);[^}]*mask: url\("\/brands\/asana\.svg"\)/);
  assert.match(styles, /\.day-completed-mark \{[^}]*background: var\(--interaction\);[^}]*color: var\(--canvas\)/);
  assert.match(styles, /\.day-completed-list a,[\s\S]*?top: -2px/);
  assert.match(styles, /\.calendar-note-indicator \{[^}]*bottom: 12px;[^}]*right: 14px;[^}]*background: var\(--interaction\)/);
  assert.doesNotMatch(styles, /\.calendar-note-indicator \{[^}]*box-shadow:/);
  assert.doesNotMatch(days, /calendar-day--empty/);
  assert.doesNotMatch(styles, /\.calendar-grid \{[^}]*border-(?:top|left):/);
  assert.match(styles, /\.safe-markdown/);
});

test("renders Today from the current Deep Thought Daily Note", async () => {
  const [client, todayView, styles, readme] = await Promise.all([
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/today-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(client, /const todayNote = dailyNotes\.find/);
  assert.match(client, /<TodayView/);
  assert.match(client, /const refreshAll = async \(\) =>/);
  assert.match(client, /const dailyContextRefresh = today \? loadDays\(today\) : Promise\.resolve\(\)/);
  assert.match(client, /Promise\.allSettled\(\[/);
  assert.match(client, /onClick=\{\(\) => void refreshAll\(\)\}/);
  assert.match(client, /aria-label=\{refreshing \? "Refreshing everything" : "Refresh everything"\}/);
  assert.match(client, /value="Refresh everything"/);
  assert.match(client, /onSelect=\{\(\) => runCommand\(refreshAll\)\}/);
  assert.doesNotMatch(client, /refreshCurrentView|Refresh Today|Refresh Logs|Refresh Asana/);
  assert.match(client, /className="runway-brand"/);
  assert.match(client, /className="runway-brand-logo"/);
  assert.match(client, /\/brands\/bandwidth-logo-color\.png/);
  assert.doesNotMatch(client, /bandwidth-logo-(?:black|white)\.png/);
  assert.match(client, /activeView !== "today" && activeView !== "days"/);
  assert.match(todayView, /splitDailyNote\(note\?\.markdown \?\? ""\)/);
  assert.match(todayView, /splitMorningBrief\(planned\)/);
  assert.match(todayView, /splitTodayPlan\(brief\.remaining\)/);
  assert.match(todayView, /countKeyTasks\(plan\.keyTasks\)/);
  assert.match(todayView, /You have \{keyTaskCount\} key/);
  assert.doesNotMatch(todayView, /markdown=\{brief\.remaining\}/);
  assert.match(todayView, /markdown=\{planned\}/);
  assert.match(todayView, /markdown=\{fallback\}/);
  assert.match(todayView, /markdown=\{reflection\}/);
  assert.match(todayView, /Run \$hello to create the note and Morning Brief/);
  assert.match(todayView, /<Drawer\.Root/);
  assert.match(todayView, /className="today-focus-card"/);
  assert.doesNotMatch(todayView, /today-date-graphic/);
  assert.match(todayView, /className="today-date-weekday"/);
  assert.match(todayView, /className="today-date-calendar"/);
  assert.match(todayView, /listPresentation="schedule"/);
  assert.match(todayView, /listPresentation="tasks"/);
  assert.match(todayView, /className="inspector drawer-panel today-focus-drawer"/);
  assert.doesNotMatch(todayView, />View profile</);
  assert.doesNotMatch(todayView, /<p>Daily Note<\/p>/);
  assert.doesNotMatch(todayView, /today-section-label">Morning Brief/);
  assert.doesNotMatch(todayView, /today-obsidian-link/);
  assert.doesNotMatch(todayView, /Open today’s Daily Note in Obsidian/);
  assert.doesNotMatch(todayView, /<Drawer\.Description/);
  assert.doesNotMatch(todayView, /dangerouslySetInnerHTML/);
  assert.match(styles, /\.today-view/);
  assert.equal(styles.match(/--accent: #FE374B;/g)?.length, 2);
  assert.match(styles, /\.today-note \{[^}]*margin: 0;/);
  assert.match(styles, /\.today-note-header h2 \{[^}]*font-size: 15px;/);
  assert.match(styles, /\.today-date-weekday \{[^}]*font-weight: 550;/);
  assert.match(styles, /\.today-section--brief \{[^}]*padding-top: 18px;[^}]*border-top: 0;/);
  assert.match(styles, /\.today-focus-card \{[^}]*padding: 17px 16px;/);
  assert.match(styles, /\.today-focus-copy \{[^}]*font-size: 13px;[^}]*letter-spacing: -0\.01em;[^}]*line-height: 1\.3;/);
  assert.match(styles, /\.today-focus-copy strong \{[^}]*font-weight: 550;/);
  assert.match(styles, /\.runway-brand-logo/);
  assert.doesNotMatch(styles, /today-date-orb/);
  assert.match(styles, /\.today-brief-list \.safe-markdown li/);
  assert.match(styles, /border-inline-start: 1px solid/);
  assert.match(styles, /padding: 2px 0 2px 11px/);
  assert.match(styles, /min-height: 0/);
  assert.match(styles, /\/symbols\/video-fill\.png/);
  assert.match(styles, /\/symbols\/circle\.png/);
  assert.match(styles, /\.today-section \.safe-markdown/);
  assert.match(readme, /Today is read-only/);
});

test("keeps Daily Note Markdown in native memory behind a narrow read-only bridge", async () => {
  const [nativeWrapper, client] = await Promise.all([
    readFile(new URL("../native/Bandwidth/Sources/Bandwidth/main.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/workload-client.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(nativeWrapper, /\.codex\/obsidian-vaults\.json/);
  assert.match(nativeWrapper, /\.obsidian\/daily-notes\.json/);
  assert.match(nativeWrapper, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\\\.md\$/);
  assert.match(nativeWrapper, /dailyNotesFolderOutsideVault/);
  assert.match(nativeWrapper, /listDailyNotes: \(\) =>/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.match(client, /window\.bandwidth\?\.listDailyNotes/);
  assert.match(client, /bandwidth:app-active/);
});

test("records only Asana-confirmed completion history", async () => {
  const [schema, database, refreshRoute, completeRoute, historyRoute] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/complete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workload/history/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /completedAt: text\("completed_at"\)/);
  assert.match(database, /completed_at TEXT/);
  assert.match(refreshRoute, /const WORK_HISTORY_START = "2026-07-06T00:00:00\.000Z"/);
  assert.match(refreshRoute, /completed_since/);
  assert.match(refreshRoute, /task\.completed && task\.completed_at/);
  assert.match(refreshRoute, /completedAt: null/);
  assert.match(completeRoute, /opt_fields", "completed,completed_at"/);
  assert.match(completeRoute, /body\.data\?\.completed_at/);
  assert.match(completeRoute, /completedAt, updatedAt: completedAt/);
  assert.match(historyRoute, /isNotNull\(workItems\.completedAt\)/);
  assert.doesNotMatch(historyRoute, /workItems\.archived/);
});
