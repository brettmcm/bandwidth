"use client";

import {
  type CSSProperties,
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Command } from "cmdk";
import Image from "next/image";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Drawer } from "vaul";
import {
  DayRecordDrawer,
  DaysView,
  localDateForTimestamp,
  type DailyNote,
  type HistoryItem,
} from "./days-view";
import { monthLabel } from "./calendar";
import { splitDailyNote } from "./daily-note";

declare global {
  interface Window {
    bandwidth?: {
      listDailyNotes: () => Promise<DailyNote[]>;
    };
  }
}

type WorkItem = {
  id: string;
  sourceType: "asana";
  officialTitle: string;
  displayTitle: string;
  titleOverridden: boolean;
  officialDueOn: string | null;
  landingStart: string | null;
  landingEnd: string | null;
  landingOverridden: boolean;
  schedulingState: "not_reviewed" | "aligned" | "tentative" | "decision_needed";
  schedulingSummary: string;
  schedulingOptions: string[];
  schedulingOwner: string | null;
  schedulingSourceUrl: string | null;
  prepDays: number;
  primaryArea: string;
  supportingAreas: string[];
  requestType: string | null;
  requester: string | null;
  priority: string | null;
  sizeBand: string | null;
  summary: string;
  note: string;
  asanaUrl: string | null;
  slackUrl: string | null;
  obsidianUrl: string | null;
  lastSyncedAt: string | null;
};

type Blackout = {
  id: string;
  label: string;
  startOn: string;
  endOn: string;
};

type WorkloadResponse = {
  items: WorkItem[];
  blackouts: Blackout[];
  asanaConnected: boolean;
  error?: string;
};

type Draft = {
  displayTitle: string;
  prepDays: number;
  primaryArea: string;
  supportingAreas: string;
  obsidianUrl: string;
};

type RunwayView = "timeline" | "area" | "days";

const DAY = 86_400_000;
const TIMELINE_BUFFER_DAYS = 7;
const MIN_TIMELINE_DAY_WIDTH = 8;
const MAX_TIMELINE_DAY_WIDTH = 72;
const HOLD_TO_COMPLETE_MS = 3_000;
const DEFAULT_TIMELINE_DAY_WIDTH =
  MIN_TIMELINE_DAY_WIDTH +
  (MAX_TIMELINE_DAY_WIDTH - MIN_TIMELINE_DAY_WIDTH) * 0.5;
const INITIAL_VIEW_LEAD_DAYS = 7;
const MIN_ITEM_FOOTPRINT_WIDTH = 330;
const ITEM_LANE_GAP_WIDTH = 44;
const TIMELINE_MAGNIFY_EVENT = "bandwidth:timeline-magnify";
const APP_ACTIVE_EVENT = "bandwidth:app-active";
const WORK_HISTORY_START_ON = "2026-07-06";
const RUNWAY_VIEWS: RunwayView[] = ["timeline", "area", "days"];
const TIMELINE_DRAG_THRESHOLD = 4;
const TIMELINE_DECELERATION_RATE = 0.998;
const TIMELINE_MOMENTUM_MIN_VELOCITY = 0.01;
const TIMELINE_MOMENTUM_MAX_VELOCITY = 3.5;
const TIMELINE_RUBBER_BAND_COEFFICIENT = 0.55;
const TIMELINE_BOUNCE_FREQUENCY = 0.018;
const TIMELINE_EDGE_EPSILON = 0.5;

type TimelineDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
  rawOverscrollX: number;
  overscrollX: number;
  moved: boolean;
};

function rubberBandDistance(distance: number, dimension: number) {
  if (distance === 0) return 0;
  const size = Math.max(1, dimension);
  const magnitude = Math.abs(distance);
  const compressed =
    (TIMELINE_RUBBER_BAND_COEFFICIENT * magnitude * size) /
    (size + TIMELINE_RUBBER_BAND_COEFFICIENT * magnitude);
  return Math.sign(distance) * compressed;
}

function rubberBandDerivative(distance: number, dimension: number) {
  const size = Math.max(1, dimension);
  const scale =
    1 + (TIMELINE_RUBBER_BAND_COEFFICIENT * Math.abs(distance)) / size;
  return TIMELINE_RUBBER_BAND_COEFFICIENT / (scale * scale);
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return isoDate(date);
}

function dayDifference(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY);
}

function isInsideBlackout(value: string, blackouts: Blackout[]) {
  return blackouts.some(({ startOn, endOn }) => value >= startOn && value <= endOn);
}

function subtractWorkingDays(end: string, prepDays: number, blackouts: Blackout[]) {
  if (prepDays <= 0) return end;
  const cursor = parseDate(end);
  let remaining = prepDays;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    const candidate = isoDate(cursor);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6 && !isInsideBlackout(candidate, blackouts)) {
      remaining -= 1;
    }
  }
  return isoDate(cursor);
}

function scheduleFor(item: WorkItem, blackouts: Blackout[]) {
  const anchor = item.landingOverridden ? item.landingStart : item.officialDueOn;
  const end = item.landingOverridden
    ? item.landingEnd ?? item.landingStart
    : item.officialDueOn;
  return {
    scheduleStart: anchor
      ? subtractWorkingDays(anchor, item.prepDays, blackouts)
      : null,
    scheduleEnd: end,
  };
}

function needsSchedulingDecision(item: WorkItem) {
  return item.schedulingState === "decision_needed";
}

function hasDateDiscrepancy(item: WorkItem) {
  if (
    !item.landingOverridden ||
    !item.officialDueOn ||
    !item.landingStart
  ) {
    return false;
  }
  return (
    item.officialDueOn !== item.landingStart ||
    Boolean(item.landingEnd && item.officialDueOn !== item.landingEnd)
  );
}

function compactDate(value: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    parseDate(value)
  );
}

function dateWindow(start: string | null, end: string | null) {
  if (!start) return "Needs a date";
  if (!end || end === start) return compactDate(start);
  const first = parseDate(start);
  const last = parseDate(end);
  if (first.getMonth() === last.getMonth()) {
    return `${new Intl.DateTimeFormat("en-US", { month: "short" }).format(first)} ${first.getDate()}–${last.getDate()}`;
  }
  return `${compactDate(start)}–${compactDate(end)}`;
}

function makeDraft(item?: WorkItem): Draft {
  return {
    displayTitle: item?.displayTitle ?? "",
    prepDays: item?.prepDays ?? 3,
    primaryArea: item?.primaryArea ?? "Needs tagging",
    supportingAreas: item?.supportingAreas.join(", ") ?? "",
    obsidianUrl: item?.obsidianUrl ?? "",
  };
}

function rulerLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    parseDate(value)
  );
}

function weekendRanges(start: string, end: string) {
  const ranges: Array<{ start: string; end: string }> = [];
  const cursor = parseDate(start);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 1) % 7));
  while (isoDate(cursor) <= end) {
    const weekendStart = isoDate(cursor);
    cursor.setDate(cursor.getDate() + 2);
    const weekendEnd = isoDate(cursor);
    const clippedStart = weekendStart < start ? start : weekendStart;
    const clippedEnd = weekendEnd > end ? end : weekendEnd;
    if (clippedStart < clippedEnd) {
      ranges.push({ start: clippedStart, end: clippedEnd });
    }
    cursor.setDate(cursor.getDate() + 5);
  }
  return ranges;
}

function detailValue(value: string | null | undefined) {
  return value?.trim() || "Not provided";
}

const PROJECT_SIZE_LABELS: Record<string, string> = {
  XXS: "Extra Extra Small",
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
  XXL: "Extra Extra Large",
};

function projectSizeLabel(value: string | null | undefined) {
  const size = value?.trim();
  if (!size) return "Not provided";
  return PROJECT_SIZE_LABELS[size.toUpperCase()] ?? size;
}

export function WorkloadClient() {
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [activeView, setActiveView] = useState<RunwayView>("timeline");
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [daysMonth, setDaysMonth] = useState<string | null>(null);
  const [dayDrawerDate, setDayDrawerDate] = useState<string | null>(null);
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [notesState, setNotesState] = useState<
    "loading" | "available" | "unavailable" | "error"
  >("loading");
  const [notesError, setNotesError] = useState<string>();
  const [historyError, setHistoryError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorEditing, setInspectorEditing] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(makeDraft());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<
    "idle" | "holding" | "submitting" | "completed"
  >("idle");
  const [blackoutOpen, setBlackoutOpen] = useState(false);
  const [blackoutDraft, setBlackoutDraft] = useState({
    label: "",
    startOn: "",
    endOn: "",
  });
  const [timelineDayWidth, setTimelineDayWidth] = useState(
    DEFAULT_TIMELINE_DAY_WIDTH
  );
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineDragRef = useRef<TimelineDrag | null>(null);
  const timelineMomentumFrameRef = useRef<number | null>(null);
  const timelineOverscrollCanvasRef = useRef<HTMLElement | null>(null);
  const suppressTimelineClickRef = useRef(false);
  const timelineDayWidthRef = useRef(DEFAULT_TIMELINE_DAY_WIDTH);
  const positionedTimeline = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const completionPendingRefreshRef = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/workload", { cache: "no-store" });
    const result = (await response.json()) as WorkloadResponse;
    if (!response.ok) throw new Error(result.error ?? "Runway unavailable");
    setData(result);
  }, []);

  const loadDays = useCallback(async (through: string) => {
    const historyRequest = fetch(
      `/api/workload/history?from=${WORK_HISTORY_START_ON}&through=${encodeURIComponent(through)}`,
      { cache: "no-store" }
    ).then(async (response) => {
      const result = (await response.json()) as { items?: HistoryItem[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Work history unavailable");
      return result.items ?? [];
    });

    const noteBridge = window.bandwidth?.listDailyNotes;
    if (noteBridge) setNotesState("loading");
    else setNotesState("unavailable");

    const [historyResult, notesResult] = await Promise.allSettled([
      historyRequest,
      noteBridge ? noteBridge() : Promise.resolve<DailyNote[]>([]),
    ]);

    if (historyResult.status === "fulfilled") {
      setHistoryItems(historyResult.value);
      setHistoryError(undefined);
    } else {
      setHistoryError(historyResult.reason instanceof Error
        ? historyResult.reason.message
        : "Work history is unavailable.");
    }

    if (!noteBridge) return;
    if (notesResult.status === "fulfilled") {
      setDailyNotes(notesResult.value);
      setNotesState("available");
      setNotesError(undefined);
    } else {
      setNotesState("error");
      setNotesError(notesResult.reason instanceof Error
        ? notesResult.reason.message
        : "Deep Thought is unavailable.");
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => setToday(isoDate(new Date())), 0);
    return () => window.clearTimeout(request);
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => {
      load().catch((error: Error) => toast.error(error.message));
    }, 0);
    return () => window.clearTimeout(request);
  }, [load]);

  useEffect(() => {
    if (!today) return;
    const request = window.setTimeout(() => void loadDays(today), 0);
    return () => window.clearTimeout(request);
  }, [loadDays, today]);

  useEffect(() => {
    if (activeView !== "days" || !today) return;
    const request = window.setTimeout(() => void loadDays(today), 0);
    return () => window.clearTimeout(request);
  }, [activeView, loadDays, today]);

  useEffect(() => {
    if (activeView !== "days" || !today) return;
    let reloadTimer: number | null = null;
    const reload = () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => void loadDays(today), 120);
    };
    window.addEventListener("focus", reload);
    window.addEventListener(APP_ACTIVE_EVENT, reload);
    return () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      window.removeEventListener("focus", reload);
      window.removeEventListener(APP_ACTIVE_EVENT, reload);
    };
  }, [activeView, loadDays, today]);

  useEffect(() => {
    const toggleCommandMenu = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", toggleCommandMenu);
    return () => document.removeEventListener("keydown", toggleCommandMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  const selected = selectedId
    ? data?.items.find((item) => item.id === selectedId)
    : undefined;
  const selectedSchedule = selected
    ? scheduleFor(selected, data?.blackouts ?? [])
    : null;

  const openInspector = (id: string) => {
    const item = data?.items.find((candidate) => candidate.id === id);
    if (!item) return;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    completionPendingRefreshRef.current = false;
    setCompletionStatus("idle");
    setSelectedId(id);
    setDraft(makeDraft(item));
    setInspectorEditing(false);
    setInspectorOpen(true);
  };

  const cancelCompletionHold = () => {
    if (completionTimerRef.current === null) return;
    window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
    setCompletionStatus("idle");
  };

  const completeAsanaTask = async (id: string) => {
    completionTimerRef.current = null;
    setCompletionStatus("submitting");
    try {
      const response = await fetch("/api/workload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not complete task");
      completionPendingRefreshRef.current = true;
      setCompletionStatus("completed");
    } catch (error) {
      setCompletionStatus("idle");
      toast.error(error instanceof Error ? error.message : "Could not complete task");
    }
  };

  const beginCompletionHold = () => {
    if (
      completionStatus !== "idle" ||
      !selectedId ||
      selectedId === "new" ||
      !data?.asanaConnected
    ) {
      return;
    }
    const taskId = selectedId;
    setCompletionStatus("holding");
    completionTimerRef.current = window.setTimeout(() => {
      void completeAsanaTask(taskId);
    }, HOLD_TO_COMPLETE_MS);
  };

  const closeInspector = () => {
    if (completionStatus === "submitting") return;
    cancelCompletionHold();
    setInspectorOpen(false);
  };

  const handleInspectorOpenChange = (open: boolean) => {
    if (!open && completionStatus === "submitting") return;
    if (!open) cancelCompletionHold();
    setInspectorOpen(open);
  };

  const editInspector = () => {
    setDraft(makeDraft(selected));
    setInspectorEditing(true);
  };

  const timelineToday = today ?? "1970-01-01";
  const timelineItems = (() => {
    if (!data) return [];
    return data.items
      .map((item) => ({ ...item, ...scheduleFor(item, data.blackouts) }))
      .sort((a, b) =>
        (a.scheduleStart ?? a.scheduleEnd ?? "9999").localeCompare(
          b.scheduleStart ?? b.scheduleEnd ?? "9999"
        )
      );
  })();

  const taskDates = timelineItems.flatMap((item) =>
    [item.scheduleStart, item.scheduleEnd].filter((date): date is string => Boolean(date))
  );
  const earliestTaskDate = taskDates.reduce(
    (earliest, date) => (date < earliest ? date : earliest),
    timelineToday
  );
  const latestTaskDate = taskDates.reduce(
    (latest, date) => (date > latest ? date : latest),
    timelineToday
  );
  const timelineStart = addCalendarDays(earliestTaskDate, -TIMELINE_BUFFER_DAYS);
  const timelineEnd = addCalendarDays(latestTaskDate, TIMELINE_BUFFER_DAYS);
  const totalDays = Math.max(1, dayDifference(timelineStart, timelineEnd));

  const productCount = new Set(timelineItems.map((item) => item.primaryArea)).size;
  const latestSync = data?.items
    .map((item) => item.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const areaGroups = Array.from(
    timelineItems.reduce((groups, item) => {
      const area = item.primaryArea.trim() || "Needs tagging";
      const group = groups.get(area) ?? [];
      group.push(item);
      groups.set(area, group);
      return groups;
    }, new Map<string, typeof timelineItems>())
  )
    .map(([area, items]) => ({
      area,
      items: items.sort((first, second) =>
        (first.scheduleEnd ?? "9999").localeCompare(second.scheduleEnd ?? "9999") ||
        first.displayTitle.localeCompare(second.displayTitle)
      ),
    }))
    .sort((first, second) => first.area.localeCompare(second.area));
  const completedByDate = historyItems.reduce((groups, item) => {
    const date = localDateForTimestamp(item.completedAt);
    const group = groups.get(date) ?? [];
    group.push(item);
    groups.set(date, group);
    return groups;
  }, new Map<string, HistoryItem[]>());
  const dayDates = (() => {
    if (!today) return [];
    const dates = new Set([today]);
    dailyNotes.forEach((note) => {
      if (note.date >= WORK_HISTORY_START_ON && note.date <= today) dates.add(note.date);
    });
    completedByDate.forEach((_items, date) => {
      if (date >= WORK_HISTORY_START_ON && date <= today) dates.add(date);
    });
    return Array.from(dates).sort((first, second) => second.localeCompare(first));
  })();
  const daysCalendarMonth = daysMonth ?? timelineToday.slice(0, 7);
  const activeDay = dayDrawerDate && today && dayDrawerDate <= today
    ? dayDrawerDate
    : timelineToday;
  const activeDayNote = dailyNotes.find((note) => note.date === activeDay);
  const activeDayCompletions = (completedByDate.get(activeDay) ?? []).sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt)
  );
  const monthlyNoteCount = dailyNotes.filter((note) => note.date.startsWith(daysCalendarMonth)).length;
  const monthlyCompletionCount = Array.from(completedByDate.entries())
    .filter(([date]) => date.startsWith(daysCalendarMonth))
    .reduce((count, [, items]) => count + items.length, 0);
  const runwaySummary = activeView === "days"
    ? `${monthLabel(daysCalendarMonth)} · ${
        notesState === "unavailable" ? "Notes local only" : `${monthlyNoteCount} notes`
      } · ${monthlyCompletionCount} completed`
    : `${dateWindow(today, latestTaskDate)} · ${timelineItems.length} commitments · ${productCount} product areas`;

  const openDayRecord = (date: string) => {
    setDaysMonth(date.slice(0, 7));
    setDayDrawerDate(date);
    setInspectorOpen(false);
    setBlackoutOpen(false);
    setDayDrawerOpen(true);
  };

  const position = (value: string) => {
    const offset = Math.max(0, Math.min(totalDays, dayDifference(timelineStart, value)));
    return `${(offset / totalDays) * 100}%`;
  };

  const widthBetween = (start: string, end: string) => {
    const first = Math.max(0, Math.min(totalDays, dayDifference(timelineStart, start)));
    const last = Math.max(
      first + 0.5,
      Math.min(totalDays, dayDifference(timelineStart, end))
    );
    return `${((last - first) / totalDays) * 100}%`;
  };

  const timelineLayout = (() => {
    const laneEnds: number[] = [];
    const minimumFootprintDays = Math.ceil(
      MIN_ITEM_FOOTPRINT_WIDTH / timelineDayWidth
    );
    const laneGapDays = Math.max(1, Math.ceil(ITEM_LANE_GAP_WIDTH / timelineDayWidth));
    const items = timelineItems.map((item) => {
      const visualStart = item.scheduleStart ?? item.scheduleEnd ?? timelineToday;
      const visualEnd = item.scheduleEnd ?? item.scheduleStart ?? visualStart;
      const startOffset = Math.max(
        0,
        Math.min(totalDays, dayDifference(timelineStart, visualStart))
      );
      const endOffset = Math.max(
        startOffset + 1,
        Math.min(totalDays, dayDifference(timelineStart, visualEnd) + 1)
      );
      const footprintEnd = Math.max(
        endOffset + laneGapDays,
        startOffset + minimumFootprintDays
      );
      let lane = laneEnds.findIndex((occupiedUntil) => occupiedUntil <= startOffset);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = footprintEnd;
      return { ...item, lane, visualStart, visualEnd };
    });
    return { items, laneCount: Math.max(1, laneEnds.length) };
  })();

  const resetTimelineOverscroll = useCallback(() => {
    if (timelineOverscrollCanvasRef.current) {
      timelineOverscrollCanvasRef.current.style.transform = "";
      timelineOverscrollCanvasRef.current.style.willChange = "";
      timelineOverscrollCanvasRef.current = null;
    }
  }, []);

  const applyTimelineOverscroll = useCallback((scroller: HTMLDivElement, offset: number) => {
    if (Math.abs(offset) < 0.001) {
      resetTimelineOverscroll();
      return;
    }
    const canvas = scroller.querySelector<HTMLElement>(".timeline-canvas");
    if (!canvas) return;
    canvas.style.willChange = "transform";
    canvas.style.transform = `translate3d(${offset}px, 0, 0)`;
    timelineOverscrollCanvasRef.current = canvas;
  }, [resetTimelineOverscroll]);

  const stopTimelineMomentum = useCallback(() => {
    if (timelineMomentumFrameRef.current !== null) {
      window.cancelAnimationFrame(timelineMomentumFrameRef.current);
      timelineMomentumFrameRef.current = null;
    }
    resetTimelineOverscroll();
  }, [resetTimelineOverscroll]);

  const startTimelineMomentum = (
    scroller: HTMLDivElement,
    drag: TimelineDrag,
    releasedAt: number
  ) => {
    if (timelineMomentumFrameRef.current !== null) {
      window.cancelAnimationFrame(timelineMomentumFrameRef.current);
      timelineMomentumFrameRef.current = null;
    }

    const idleTime = Math.max(0, releasedAt - drag.lastTime);
    const releaseFactor = Math.max(0, Math.min(1, 1 - Math.max(0, idleTime - 50) / 100));
    let velocityX = drag.velocityX * releaseFactor;
    let velocityY = drag.velocityY * releaseFactor;
    const canvas = scroller.querySelector<HTMLElement>(".timeline-canvas");
    let bounceOffsetX = drag.overscrollX;
    let bouncingX = Boolean(canvas) && Math.abs(bounceOffsetX) >= 0.001;
    let bounceVelocityX = bouncingX
      ? -velocityX * rubberBandDerivative(drag.rawOverscrollX, scroller.clientWidth)
      : 0;
    if (bouncingX) velocityX = 0;
    if (
      Math.abs(velocityX) < TIMELINE_MOMENTUM_MIN_VELOCITY &&
      Math.abs(velocityY) < TIMELINE_MOMENTUM_MIN_VELOCITY &&
      !bouncingX
    ) {
      resetTimelineOverscroll();
      return;
    }

    let lastFrame = performance.now();
    const coast = (timestamp: number) => {
      const elapsed = Math.min(34, Math.max(0, timestamp - lastFrame));
      lastFrame = timestamp;

      const previousTop = scroller.scrollTop;
      if (!bouncingX) {
        const requestedLeft = scroller.scrollLeft + velocityX * elapsed;
        scroller.scrollLeft = requestedLeft;
        const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const crossedLeftEdge =
          requestedLeft < 0 && scroller.scrollLeft <= TIMELINE_EDGE_EPSILON;
        const crossedRightEdge =
          requestedLeft > maxLeft &&
          scroller.scrollLeft >= maxLeft - TIMELINE_EDGE_EPSILON;
        if ((crossedLeftEdge || crossedRightEdge) && canvas) {
          const rawOverscrollX = crossedLeftEdge
            ? -requestedLeft
            : maxLeft - requestedLeft;
          bounceOffsetX = rubberBandDistance(rawOverscrollX, scroller.clientWidth);
          bounceVelocityX =
            -velocityX * rubberBandDerivative(rawOverscrollX, scroller.clientWidth);
          bouncingX = true;
          velocityX = 0;
          applyTimelineOverscroll(scroller, bounceOffsetX);
        }
      }
      scroller.scrollTop += velocityY * elapsed;

      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (
        (scroller.scrollTop <= 0 && velocityY < 0) ||
        (scroller.scrollTop >= maxTop && velocityY > 0) ||
        (scroller.scrollTop === previousTop && velocityY !== 0)
      ) {
        velocityY = 0;
      }

      if (bouncingX && canvas) {
        const springMomentum =
          bounceVelocityX + TIMELINE_BOUNCE_FREQUENCY * bounceOffsetX;
        const springDecay = Math.exp(-TIMELINE_BOUNCE_FREQUENCY * elapsed);
        bounceOffsetX =
          (bounceOffsetX + springMomentum * elapsed) * springDecay;
        bounceVelocityX =
          (bounceVelocityX -
            TIMELINE_BOUNCE_FREQUENCY * springMomentum * elapsed) *
          springDecay;

        if (
          Math.abs(bounceOffsetX) < 0.1 &&
          Math.abs(bounceVelocityX) < TIMELINE_MOMENTUM_MIN_VELOCITY
        ) {
          bounceOffsetX = 0;
          bounceVelocityX = 0;
          bouncingX = false;
          resetTimelineOverscroll();
        } else {
          applyTimelineOverscroll(scroller, bounceOffsetX);
        }
      }

      const decay = Math.pow(TIMELINE_DECELERATION_RATE, elapsed);
      velocityX *= decay;
      velocityY *= decay;

      if (
        Math.abs(velocityX) < TIMELINE_MOMENTUM_MIN_VELOCITY &&
        Math.abs(velocityY) < TIMELINE_MOMENTUM_MIN_VELOCITY &&
        !bouncingX
      ) {
        timelineMomentumFrameRef.current = null;
        resetTimelineOverscroll();
        return;
      }
      timelineMomentumFrameRef.current = window.requestAnimationFrame(coast);
    };

    timelineMomentumFrameRef.current = window.requestAnimationFrame(coast);
  };

  useEffect(() => () => {
    if (timelineMomentumFrameRef.current !== null) {
      window.cancelAnimationFrame(timelineMomentumFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!data || positionedTimeline.current) return;
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const frame = window.requestAnimationFrame(() => {
      const initialDayOffset = Math.max(
        0,
        dayDifference(timelineStart, timelineToday) - INITIAL_VIEW_LEAD_DAYS
      );
      scroller.scrollLeft = scroller.scrollWidth * (initialDayOffset / totalDays);
      positionedTimeline.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data, timelineStart, timelineToday, totalDays]);

  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller) return;

    type ZoomAnchor = { ratio: number; pointerX: number };
    let zoomAnchor: ZoomAnchor | null = null;
    let pendingWidth = timelineDayWidthRef.current;
    let zoomFrame: number | null = null;

    const beginZoom = (clientX: number, clientY: number) => {
      stopTimelineMomentum();
      const bounds = scroller.getBoundingClientRect();
      if (
        clientX < bounds.left ||
        clientX > bounds.right ||
        clientY < bounds.top ||
        clientY > bounds.bottom
      ) {
        zoomAnchor = null;
        return false;
      }

      const canvas = scroller.querySelector<HTMLElement>(".timeline-canvas");
      if (!canvas) return false;
      const pointerX = Math.max(0, Math.min(bounds.width, clientX - bounds.left));
      zoomAnchor = {
        ratio: Math.max(
          0,
          Math.min(1, (scroller.scrollLeft + pointerX) / canvas.offsetWidth)
        ),
        pointerX,
      };
      return true;
    };

    const keepAnchorFixed = (canvas: HTMLElement, anchor: ZoomAnchor) => {
      scroller.scrollLeft = anchor.ratio * canvas.offsetWidth - anchor.pointerX;
    };

    const commitZoom = (canvas: HTMLElement) => {
      if (zoomFrame !== null) return;
      zoomFrame = window.requestAnimationFrame(() => {
        zoomFrame = null;
        const committedWidth = pendingWidth;
        flushSync(() => setTimelineDayWidth(committedWidth));
        if (zoomAnchor) keepAnchorFixed(canvas, zoomAnchor);
      });
    };

    const magnifyTimeline = (magnification: number) => {
      if (!zoomAnchor || magnification === 0) return;
      const canvas = scroller.querySelector<HTMLElement>(".timeline-canvas");
      if (!canvas) return;

      const currentWidth = timelineDayWidthRef.current;
      const nextWidth = Math.max(
        MIN_TIMELINE_DAY_WIDTH,
        Math.min(
          MAX_TIMELINE_DAY_WIDTH,
          currentWidth * Math.exp(magnification)
        )
      );
      if (Math.abs(nextWidth - currentWidth) < 0.01) return;

      timelineDayWidthRef.current = nextWidth;
      pendingWidth = nextWidth;
      canvas.style.setProperty("--timeline-width", `${totalDays * nextWidth}px`);
      keepAnchorFixed(canvas, zoomAnchor);
      commitZoom(canvas);
    };

    const handleNativeMagnification = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          magnification?: number;
          clientX?: number;
          clientY?: number;
          phase?: "began" | "changed" | "ended" | "cancelled";
        }>
      ).detail;
      if (
        !detail ||
        !Number.isFinite(detail.magnification) ||
        !Number.isFinite(detail.clientX) ||
        !Number.isFinite(detail.clientY) ||
        !detail.phase
      ) {
        return;
      }

      const clientX = detail.clientX as number;
      const clientY = detail.clientY as number;
      if (detail.phase === "began") {
        beginZoom(clientX, clientY);
      } else if (detail.phase === "changed") {
        if (!zoomAnchor && !beginZoom(clientX, clientY)) return;
        magnifyTimeline(detail.magnification as number);
      } else {
        magnifyTimeline(detail.magnification as number);
        zoomAnchor = null;
      }
    };

    const handleBrowserMagnification = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (!beginZoom(event.clientX, event.clientY)) return;
      magnifyTimeline(-event.deltaY / 100);
      zoomAnchor = null;
    };

    window.addEventListener(TIMELINE_MAGNIFY_EVENT, handleNativeMagnification);
    scroller.addEventListener("wheel", handleBrowserMagnification, { passive: false });
    return () => {
      if (zoomFrame !== null) window.cancelAnimationFrame(zoomFrame);
      window.removeEventListener(TIMELINE_MAGNIFY_EVENT, handleNativeMagnification);
      scroller.removeEventListener("wheel", handleBrowserMagnification);
    };
  }, [data, stopTimelineMomentum, totalDays]);

  const setTimelineZoom = (requestedWidth: number) => {
    const nextWidth = Math.max(
      MIN_TIMELINE_DAY_WIDTH,
      Math.min(MAX_TIMELINE_DAY_WIDTH, requestedWidth)
    );
    const scroller = timelineScrollRef.current;
    const canvas = scroller?.querySelector<HTMLElement>(".timeline-canvas");

    if (scroller && canvas) {
      const pointerX = scroller.clientWidth / 2;
      const anchorRatio = Math.max(
        0,
        Math.min(1, (scroller.scrollLeft + pointerX) / canvas.offsetWidth)
      );
      canvas.style.setProperty("--timeline-width", `${totalDays * nextWidth}px`);
      scroller.scrollLeft = anchorRatio * canvas.offsetWidth - pointerX;
    }

    timelineDayWidthRef.current = nextWidth;
    setTimelineDayWidth(nextWidth);
  };

  const beginTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || event.pointerType === "touch") return;
    stopTimelineMomentum();
    suppressTimelineClickRef.current = false;
    timelineDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
      rawOverscrollX: 0,
      overscrollX: 0,
      moved: false,
    };
  };

  const dragTimeline = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = timelineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(deltaX, deltaY) < TIMELINE_DRAG_THRESHOLD) return;
      drag.moved = true;
      suppressTimelineClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setTimelineDragging(true);
    }

    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    const instantVelocityX = -(event.clientX - drag.lastX) / elapsed;
    const instantVelocityY = -(event.clientY - drag.lastY) / elapsed;
    drag.velocityX = Math.max(
      -TIMELINE_MOMENTUM_MAX_VELOCITY,
      Math.min(
        TIMELINE_MOMENTUM_MAX_VELOCITY,
        drag.velocityX * 0.55 + instantVelocityX * 0.45
      )
    );
    drag.velocityY = Math.max(
      -TIMELINE_MOMENTUM_MAX_VELOCITY,
      Math.min(
        TIMELINE_MOMENTUM_MAX_VELOCITY,
        drag.velocityY * 0.55 + instantVelocityY * 0.45
      )
    );
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    event.preventDefault();
    const requestedLeft = drag.scrollLeft - deltaX;
    event.currentTarget.scrollLeft = requestedLeft;
    event.currentTarget.scrollTop = drag.scrollTop - deltaY;
    const maxLeft = Math.max(
      0,
      event.currentTarget.scrollWidth - event.currentTarget.clientWidth
    );
    const crossedLeftEdge =
      requestedLeft < 0 &&
      event.currentTarget.scrollLeft <= TIMELINE_EDGE_EPSILON;
    const crossedRightEdge =
      requestedLeft > maxLeft &&
      event.currentTarget.scrollLeft >= maxLeft - TIMELINE_EDGE_EPSILON;
    const rawOverscrollX = crossedLeftEdge
      ? -requestedLeft
      : crossedRightEdge
        ? maxLeft - requestedLeft
        : 0;
    drag.rawOverscrollX = rawOverscrollX;
    drag.overscrollX = rubberBandDistance(
      rawOverscrollX,
      event.currentTarget.clientWidth
    );
    applyTimelineOverscroll(event.currentTarget, drag.overscrollX);
  };

  const endTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = timelineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    timelineDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setTimelineDragging(false);
    if (drag.moved && event.type === "pointerup") {
      startTimelineMomentum(event.currentTarget, drag, event.timeStamp);
    }
  };

  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      displayTitle: draft.displayTitle,
      prepDays: Number(draft.prepDays),
      primaryArea: draft.primaryArea,
      supportingAreas: draft.supportingAreas
        .split(",")
        .map((area) => area.trim())
        .filter(Boolean),
      obsidianUrl: draft.obsidianUrl,
    };
    try {
      const response = await fetch("/api/workload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, patch: payload }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save commitment");
      await load();
      setInspectorEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save commitment");
    } finally {
      setSaving(false);
    }
  };

  const refreshAsana = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/workload/refresh", { method: "POST" });
      const result = (await response.json()) as {
        error?: string;
        count?: number;
        historyCount?: number;
        removedCount?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "Asana refresh failed");
      await load();
      const removed = result.removedCount ?? 0;
      toast.success(
        `${result.count ?? 0} official requests refreshed${
          removed > 0 ? ` · ${removed} removed` : ""
        }`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Asana refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshCurrentView = async () => {
    await refreshAsana();
    if (activeView === "days" && today) await loadDays(today);
  };

  const openBlackouts = () => {
    setBlackoutOpen(true);
  };

  const closeBlackouts = () => {
    setBlackoutOpen(false);
  };

  const runCommand = (action: () => void) => {
    setCommandOpen(false);
    window.setTimeout(action, 0);
  };

  const addBlackout = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/workload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "blackout", ...blackoutDraft }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not add blackout");
      setBlackoutDraft({ label: "", startOn: "", endOn: "" });
      await load();
      toast.success("Blackout added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add blackout");
    }
  };

  const removeBlackout = async (id: string) => {
    try {
      const response = await fetch(`/api/workload?kind=blackout&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not remove blackout");
      await load();
      toast.success("Blackout removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove blackout");
    }
  };

  const rulerMarks = [timelineToday];
  const rulerCursor = parseDate(timelineStart);
  rulerCursor.setDate(1);
  if (isoDate(rulerCursor) < timelineStart) {
    rulerCursor.setMonth(rulerCursor.getMonth() + 1);
  }
  while (isoDate(rulerCursor) <= timelineEnd) {
    rulerMarks.push(isoDate(rulerCursor));
    rulerCursor.setMonth(rulerCursor.getMonth() + 1);
  }
  const uniqueRulerMarks = Array.from(new Set(rulerMarks)).sort();
  const weekends = weekendRanges(timelineStart, timelineEnd);
  const completionLabel =
    completionStatus === "submitting"
      ? "Completing in Asana…"
      : completionStatus === "completed"
        ? "Completed in Asana"
        : "Mark as done";

  return (
    <main className="runway-shell">
      <header className="runway-header">
        <div>
          <h1>Bandwidth</h1>
          <p className="runway-summary">
            {today
              ? runwaySummary
              : "Loading runway…"}
          </p>
        </div>
        <div className="runway-actions" aria-label="Runway actions">
          <button
            className="icon-action runway-icon-action"
            type="button"
            onClick={openBlackouts}
            aria-label="Blackouts"
            title="Blackouts"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <button
            className="icon-action runway-icon-action"
            type="button"
            onClick={() => void refreshCurrentView()}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing" : activeView === "days" ? "Refresh Days" : "Refresh Asana"}
            title={refreshing ? "Refreshing…" : activeView === "days" ? "Refresh Days" : "Refresh Asana"}
          >
            <svg className={refreshing ? "refresh-icon refresh-icon--spinning" : "refresh-icon"} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6v5h-5M4 18v-5h5" />
              <path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15" />
            </svg>
          </button>
        </div>
      </header>

      {!data || !today ? (
        <p className="loading-state">Loading runway…</p>
      ) : (
        <>
          <div
            className="runway-tabs"
            aria-label="Workload views"
            role="tablist"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const activeIndex = RUNWAY_VIEWS.indexOf(activeView);
              const nextView = RUNWAY_VIEWS[
                (activeIndex + direction + RUNWAY_VIEWS.length) % RUNWAY_VIEWS.length
              ];
              setActiveView(nextView);
              window.requestAnimationFrame(() => {
                document.getElementById(`${nextView}-tab`)?.focus();
              });
            }}
          >
            <button
              className={`runway-tab${activeView === "timeline" ? " runway-tab--active" : ""}`}
              type="button"
              role="tab"
              id="timeline-tab"
              aria-controls="timeline-panel"
              aria-selected={activeView === "timeline"}
              tabIndex={activeView === "timeline" ? 0 : -1}
              onClick={() => setActiveView("timeline")}
            >
              Timeline
            </button>
            <button
              className={`runway-tab${activeView === "area" ? " runway-tab--active" : ""}`}
              type="button"
              role="tab"
              id="area-tab"
              aria-controls="area-panel"
              aria-selected={activeView === "area"}
              tabIndex={activeView === "area" ? 0 : -1}
              onClick={() => setActiveView("area")}
            >
              Area
            </button>
            <button
              className={`runway-tab${activeView === "days" ? " runway-tab--active" : ""}`}
              type="button"
              role="tab"
              id="days-tab"
              aria-controls="days-panel"
              aria-selected={activeView === "days"}
              tabIndex={activeView === "days" ? 0 : -1}
              onClick={() => setActiveView("days")}
            >
              Days
            </button>
          </div>

          <section
            className="runway-field"
            id="timeline-panel"
            role="tabpanel"
            aria-labelledby="timeline-tab"
            hidden={activeView !== "timeline"}
          >
          <div
            className={`timeline-scroller${timelineDragging ? " timeline-scroller--dragging" : ""}`}
            ref={timelineScrollRef}
            role="region"
            aria-label={`Scrollable timeline from ${compactDate(timelineStart)} to ${compactDate(timelineEnd)}`}
            onPointerDown={beginTimelineDrag}
            onPointerMove={dragTimeline}
            onPointerUp={endTimelineDrag}
            onPointerCancel={endTimelineDrag}
            onLostPointerCapture={endTimelineDrag}
            onWheel={stopTimelineMomentum}
            onClickCapture={(event) => {
              if (!suppressTimelineClickRef.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressTimelineClickRef.current = false;
            }}
          >
            <div
              className="timeline-canvas"
              style={{
                "--timeline-width": `${totalDays * timelineDayWidth}px`,
                "--timeline-lanes": timelineLayout.laneCount,
              } as CSSProperties}
            >
              <div className="timeline-ruler" aria-hidden="true">
                <span className="ruler-baseline" />
                {uniqueRulerMarks.map((mark) => (
                  <span
                    className={`ruler-mark ${mark === timelineToday ? "ruler-mark--today" : ""}`}
                    key={mark}
                    style={{ left: position(mark) }}
                  >
                    <span className="ruler-label">
                      {rulerLabel(mark)}{mark === timelineToday ? " · today" : ""}
                    </span>
                    <span className="ruler-dot" />
                  </span>
                ))}
              </div>

              <div className="timeline-background" aria-hidden="true">
                {weekends.map((weekend) => (
                  <span
                    className="weekend-band"
                    key={weekend.start}
                    style={{
                      left: position(weekend.start),
                      width: widthBetween(weekend.start, weekend.end),
                    }}
                  />
                ))}
                <span className="today-line" style={{ left: position(timelineToday) }} />
                {data.blackouts
                  .filter(
                    (blackout) =>
                      blackout.startOn <= timelineEnd && blackout.endOn >= timelineStart
                  )
                  .map((blackout) => (
                    <span
                      className="blackout-band"
                      key={blackout.id}
                      style={{
                        left: position(blackout.startOn),
                        width: widthBetween(
                          blackout.startOn,
                          addCalendarDays(blackout.endOn, 1)
                        ),
                      }}
                    >
                      <span>{blackout.label}</span>
                    </span>
                  ))}
              </div>

              <div className="timeline-items">
                {timelineLayout.items.map((item) => {
                  const datesDiffer = hasDateDiscrepancy(item);
                  const decisionNeeded = needsSchedulingDecision(item);
                  return (
                    <button
                      className={`timeline-card${decisionNeeded ? " timeline-card--decision-needed" : ""}`}
                      type="button"
                      key={item.id}
                      onClick={() => openInspector(item.id)}
                      aria-label={`View ${item.displayTitle} details${decisionNeeded ? ", scheduling decision needed" : datesDiffer ? ", dates differ" : ""}`}
                      style={{
                        left: position(item.visualStart),
                        top: `${item.lane * 112}px`,
                        width: `max(248px, ${widthBetween(
                          item.visualStart,
                          addCalendarDays(item.visualEnd, 1)
                        )})`,
                      }}
                    >
                      <span className="timeline-card-bar" aria-hidden="true">
                        <span className="timeline-card-dot" />
                      </span>
                      <span className="timeline-card-heading">
                        <span className="timeline-card-title">{item.displayTitle}</span>
                        <span className="timeline-card-date">
                          {dateWindow(item.scheduleStart, item.scheduleEnd)}
                        </span>
                      </span>
                      <span className="timeline-card-meta">
                        <span>{item.primaryArea}</span>
                        {decisionNeeded ? (
                          <span
                            className="timeline-card-decision-flag"
                            role="img"
                            aria-label="Scheduling decision needed"
                            title="Scheduling decision needed"
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                              <path d="M8 2 14 13H2L8 2Z" />
                              <path d="M8 5.5v3.6M8 11.4v.1" />
                            </svg>
                          </span>
                        ) : datesDiffer ? (
                          <span className="timeline-card-date-flag">Dates differ</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <footer className="runway-footer">
            <span>
              {data.asanaConnected ? "Asana connected" : "Local snapshot"}
              {latestSync ? ` · refreshed ${compactDate(latestSync.slice(0, 10))}` : ""}
            </span>
            <label className="timeline-zoom-control">
              <span className="sr-only">Timeline zoom</span>
              <input
                aria-label="Timeline zoom"
                type="range"
                min={MIN_TIMELINE_DAY_WIDTH}
                max={MAX_TIMELINE_DAY_WIDTH}
                step="1"
                value={timelineDayWidth}
                onChange={(event) => setTimelineZoom(Number(event.currentTarget.value))}
              />
            </label>
          </footer>
          </section>

          <section
            className="runway-field area-field"
            id="area-panel"
            role="tabpanel"
            aria-labelledby="area-tab"
            hidden={activeView !== "area"}
          >
            <div
              className="area-scroller"
              role="region"
              aria-label="Commitments grouped by primary product area"
            >
              <div
                className="area-groups"
                style={{
                  gridTemplateColumns: `repeat(${areaGroups.length}, minmax(280px, 1fr))`,
                  minWidth: `${areaGroups.length * 280 + Math.max(0, areaGroups.length - 1) * 10}px`,
                }}
              >
                {areaGroups.map(({ area, items }) => (
                  <section className="area-column" key={area} aria-labelledby={`area-${area.replace(/\s+/g, "-").toLowerCase()}`}>
                    <h2
                      className="area-column-title"
                      id={`area-${area.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {area}
                    </h2>
                    <div className="area-card-list">
                      {items.map((item) => (
                        <button
                          className="area-card"
                          type="button"
                          key={item.id}
                          onClick={() => openInspector(item.id)}
                          aria-label={`View ${item.displayTitle} details`}
                        >
                          <span className="area-card-copy">
                            <strong>{item.displayTitle}</strong>
                            <span>{item.requestType || "Support type not set"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section
            className="runway-field days-field"
            id="days-panel"
            role="tabpanel"
            aria-labelledby="days-tab"
            hidden={activeView !== "days"}
          >
            <DaysView
              visibleMonth={daysCalendarMonth}
              today={today}
              minimumDate={WORK_HISTORY_START_ON}
              notes={dailyNotes}
              notesState={notesState}
              notesError={notesError}
              onChangeMonth={setDaysMonth}
              onOpenDate={openDayRecord}
            />
          </section>
        </>
      )}

      <Command.Dialog
        label="Bandwidth commands"
        loop
        vimBindings={false}
        open={commandOpen}
        onOpenChange={setCommandOpen}
        overlayClassName="command-overlay"
        contentClassName="command-dialog"
      >
        <div className="command-input-row">
          <span aria-hidden="true">⌕</span>
          <Command.Input placeholder="Search commands, commitments, and days…" />
          <kbd>esc</kbd>
        </div>
        <Command.List>
          <Command.Empty>No commands, commitments, or days found.</Command.Empty>
          <Command.Group heading="Actions">
            <Command.Item
              value="Manage blackouts"
              keywords={["dates", "time off", "unavailable"]}
              onSelect={() => runCommand(openBlackouts)}
            >
              <span className="command-item-mark" aria-hidden="true">—</span>
              <span>Manage blackouts</span>
            </Command.Item>
            <Command.Item
              disabled={refreshing}
              value="Refresh Asana"
              keywords={["sync", "official requests"]}
              onSelect={() => runCommand(refreshAsana)}
            >
              <span className="command-item-mark" aria-hidden="true">↻</span>
              <span>{refreshing ? "Refreshing Asana…" : "Refresh Asana"}</span>
            </Command.Item>
            <Command.Item
              value="Open Days"
              keywords={["history", "daily notes", "calendar", "completed", "reflection"]}
              onSelect={() => runCommand(() => {
                if (today) setDaysMonth(today.slice(0, 7));
                setActiveView("days");
              })}
            >
              <span className="command-item-mark" aria-hidden="true">◫</span>
              <span>Open Days</span>
            </Command.Item>
          </Command.Group>
          {dayDates.length ? (
            <Command.Group heading="Days">
              {dayDates.map((date) => {
                const note = dailyNotes.find((candidate) => candidate.date === date);
                const completed = completedByDate.get(date) ?? [];
                return (
                  <Command.Item
                    key={date}
                    value={`Open day ${date}`}
                    keywords={[
                      date,
                      splitDailyNote(note?.markdown ?? "").reflection,
                      ...completed.map((item) => item.displayTitle),
                    ]}
                    onSelect={() => runCommand(() => {
                      setActiveView("days");
                      openDayRecord(date);
                    })}
                  >
                    <span className="command-item-mark" aria-hidden="true">{date.slice(-2)}</span>
                    <span className="command-item-copy">
                      <strong>{compactDate(date)}</strong>
                      <small>
                        {completed.length} completed · {note ? "Daily Note" : "No Daily Note"}
                      </small>
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}
          {data?.items.length ? (
            <Command.Group heading="Commitments">
              {data.items.map((item) => {
                const schedule = scheduleFor(item, data.blackouts);
                return (
                  <Command.Item
                    key={item.id}
                    value={`Open ${item.displayTitle}`}
                    keywords={[
                      item.officialTitle,
                      item.primaryArea,
                      ...item.supportingAreas,
                      item.requester ?? "",
                    ]}
                    onSelect={() => runCommand(() => openInspector(item.id))}
                  >
                    <span className="command-item-mark command-item-mark--dot" aria-hidden="true" />
                    <span className="command-item-copy">
                      <strong>{item.displayTitle}</strong>
                      <small>
                        {item.primaryArea} · {dateWindow(
                          schedule.scheduleStart,
                          schedule.scheduleEnd
                        )}
                      </small>
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command.Dialog>

      <DayRecordDrawer
        open={dayDrawerOpen}
        onOpenChange={setDayDrawerOpen}
        date={activeDay}
        note={activeDayNote}
        completed={activeDayCompletions}
        notesState={notesState}
        notesError={notesError}
        historyError={historyError}
      />

      <Drawer.Root
        direction="right"
        handleOnly
        open={inspectorOpen}
        onOpenChange={handleInspectorOpenChange}
        onAnimationEnd={(open) => {
          if (!open) {
            if (completionPendingRefreshRef.current) {
              completionPendingRefreshRef.current = false;
              void load().catch((error: Error) => toast.error(error.message));
            }
            setSelectedId(null);
            setInspectorEditing(false);
            setCompletionStatus("idle");
          }
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="drawer-overlay" />
          <Drawer.Content className="inspector drawer-panel">
            <div className="inspector-layout">
              <header className="inspector-header">
                <div className="inspector-heading">
                  <Drawer.Title>
                    {selected?.displayTitle ?? "Commitment"}
                  </Drawer.Title>
                  <Drawer.Description className="sr-only">
                    {selected ? `${selected.displayTitle} details` : "Commitment details"}
                  </Drawer.Description>
                  {selected ? (
                    <nav className="task-source-links" aria-label="Task links" data-vaul-no-drag>
                      {selected.asanaUrl ? (
                        <a
                          className="task-source-link task-source-link--asana"
                          href={selected.asanaUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open in Asana"
                        >
                          <Image src="/brands/asana.svg" alt="" width={12} height={12} />
                          <span>Asana</span>
                        </a>
                      ) : null}
                      {selected.slackUrl ? (
                        <a
                          className="task-source-link task-source-link--slack"
                          href={selected.slackUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open in Slack"
                        >
                          <Image src="/brands/slack.svg" alt="" width={12} height={12} />
                          <span>Slack</span>
                        </a>
                      ) : null}
                      {selected.obsidianUrl ? (
                        <a
                          className="task-source-link task-source-link--obsidian"
                          href={selected.obsidianUrl}
                          aria-label="Open in Obsidian"
                        >
                          <Image src="/brands/obsidian.svg" alt="" width={12} height={12} />
                          <span>Obsidian</span>
                        </a>
                      ) : null}
                    </nav>
                  ) : null}
                </div>
                <div className="inspector-header-actions" data-vaul-no-drag>
                  {selected && completionStatus !== "completed" ? (!inspectorEditing ? (
                    <button
                      key="edit"
                      className="quiet-action task-source-edit"
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        editInspector();
                      }}
                    >
                      <span className="task-source-edit-label">Edit</span>
                    </button>
                  ) : (
                    <button
                      key="done"
                      className="quiet-action task-source-edit"
                      type="submit"
                      form="inspector-edit-form"
                      disabled={saving}
                    >
                      <span className="task-source-edit-label">Done</span>
                    </button>
                  )) : null}
                  <button
                    className="icon-action"
                    type="button"
                    onClick={closeInspector}
                    disabled={completionStatus === "submitting"}
                    aria-label="Close inspector"
                  >
                    ×
                  </button>
                </div>
              </header>

              {selected && !inspectorEditing ? (
                <div className="inspector-view" data-vaul-no-drag>
                  {needsSchedulingDecision(selected) ? (
                    <section className="inspector-decision-banner" aria-label="Scheduling decision">
                      <aside className="schedule-decision" aria-labelledby="schedule-decision-heading">
                        <div className="schedule-decision-heading">
                          <h4 id="schedule-decision-heading">Date decision needed</h4>
                        </div>
                        <p>{detailValue(selected.schedulingSummary)}</p>
                        <footer className="schedule-decision-footer">
                          <span>
                            <small>Owner</small>
                            <strong>{detailValue(selected.schedulingOwner)}</strong>
                          </span>
                          {selected.schedulingSourceUrl || selected.slackUrl ? (
                            <a
                              className="schedule-decision-link"
                              href={selected.schedulingSourceUrl ?? selected.slackUrl ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Review Slack thread
                            </a>
                          ) : null}
                        </footer>
                      </aside>
                    </section>
                  ) : null}
                  <section
                    className="inspector-section inspector-section--runway inspector-section--untitled"
                    aria-label="Runway plan"
                  >
                    <dl className="metadata-grid metadata-grid--runway">
                      <div>
                        <dt>Schedule</dt>
                        <dd>
                          {dateWindow(
                            selectedSchedule?.scheduleStart ?? null,
                            selectedSchedule?.scheduleEnd ?? null
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Prep</dt>
                        <dd>{selected.prepDays} {selected.prepDays === 1 ? "day" : "days"}</dd>
                      </div>
                      <div>
                        <dt>Primary area</dt>
                        <dd>{detailValue(selected.primaryArea)}</dd>
                      </div>
                      <div>
                        <dt>Supporting areas</dt>
                        <dd>{selected.supportingAreas.length ? selected.supportingAreas.join(", ") : "None"}</dd>
                      </div>
                    </dl>
                    {hasDateDiscrepancy(selected) && !needsSchedulingDecision(selected) ? (
                      <aside className="date-review" aria-labelledby="date-review-heading">
                        <div className="date-review-heading">
                          <span className="date-review-dot" aria-hidden="true" />
                          <h4 id="date-review-heading">Dates differ</h4>
                        </div>
                        <dl className="date-review-comparison">
                          <div>
                            <dt>Asana due</dt>
                            <dd>{compactDate(selected.officialDueOn)}</dd>
                          </div>
                          <div>
                            <dt>Saved landing</dt>
                            <dd>{dateWindow(selected.landingStart, selected.landingEnd)}</dd>
                          </div>
                        </dl>
                        <p>
                          The saved landing may reflect a later agreement. Review the request
                          thread before deciding which date to use.
                        </p>
                        {selected.slackUrl ? (
                          <a href={selected.slackUrl} target="_blank" rel="noreferrer">
                            Review Slack thread
                          </a>
                        ) : null}
                      </aside>
                    ) : null}
                  </section>

                  <section className="inspector-section inspector-section--untitled" aria-label="Summary">
                    <p className={selected.summary ? "detail-prose" : "detail-prose detail-prose--empty"}>
                      {detailValue(selected.summary)}
                    </p>
                  </section>

                  <section
                    className="inspector-section inspector-section--source inspector-section--untitled"
                    aria-label="Asana metadata"
                  >
                      <button
                        type="button"
                        className="source-sync-lock"
                        aria-label="This data is synced with Asana"
                        data-tooltip="This data is synced with Asana"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M4 7.25h8v6H4z" />
                        </svg>
                      </button>
                      <dl className="metadata-grid">
                        <div className="metadata-item--wide">
                          <dt>Official title</dt>
                          <dd>{detailValue(selected.officialTitle)}</dd>
                        </div>
                        <div>
                          <dt>Due date</dt>
                          <dd>{compactDate(selected.officialDueOn)}</dd>
                        </div>
                        <div>
                          <dt>Request type</dt>
                          <dd>{detailValue(selected.requestType)}</dd>
                        </div>
                        <div>
                          <dt>Requester</dt>
                          <dd>{detailValue(selected.requester)}</dd>
                        </div>
                        <div>
                          <dt>Priority</dt>
                          <dd>{detailValue(selected.priority)}</dd>
                        </div>
                        <div>
                          <dt>Project size</dt>
                          <dd>{projectSizeLabel(selected.sizeBand)}</dd>
                        </div>
                        <div>
                          <dt>Last refreshed</dt>
                          <dd>{selected.lastSyncedAt ? compactDate(selected.lastSyncedAt.slice(0, 10)) : "Not yet"}</dd>
                        </div>
                      </dl>
                  </section>
                  <footer className="inspector-footer" data-vaul-no-drag>
                    <button
                      type="button"
                      className={`task-complete-action task-complete-action--${completionStatus}`}
                      disabled={
                        !data?.asanaConnected ||
                        completionStatus === "submitting" ||
                        completionStatus === "completed"
                      }
                      aria-label={
                        !data?.asanaConnected
                          ? "Connect Asana to mark this task as done"
                          : completionStatus === "completed"
                          ? "Completed in Asana"
                          : "Hold for 3 seconds to complete in Asana"
                      }
                      title={
                        data?.asanaConnected
                          ? undefined
                          : "Connect Asana to mark this task as done"
                      }
                      onPointerDown={(event) => {
                        if (!event.isPrimary || event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        beginCompletionHold();
                      }}
                      onPointerUp={cancelCompletionHold}
                      onPointerCancel={cancelCompletionHold}
                      onLostPointerCapture={cancelCompletionHold}
                      onKeyDown={(event) => {
                        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                          event.preventDefault();
                          beginCompletionHold();
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.preventDefault();
                          cancelCompletionHold();
                        }
                      }}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      <span className="task-complete-action-content" aria-live="polite">
                        <span className="task-complete-action-logo" aria-hidden="true" />
                        <span>{completionLabel}</span>
                      </span>
                      <span className="task-complete-action-fill" aria-hidden="true">
                        <span className="task-complete-action-content">
                          <span className="task-complete-action-logo" />
                          <span>{completionLabel}</span>
                        </span>
                      </span>
                    </button>
                  </footer>
                </div>
              ) : (
                <form id="inspector-edit-form" className="inspector-form" onSubmit={saveItem}>
                  <div className="inspector-fields inspector-fields--asana" data-vaul-no-drag>
                    <label className="field field--runway-name">
                      <span>Runway name</span>
                      <input
                        value={draft.displayTitle}
                        onChange={(event) => setDraft({ ...draft, displayTitle: event.target.value })}
                        required
                      />
                    </label>
                    <label className="field field--prep-compact">
                      <span>Prep days</span>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={draft.prepDays}
                        onChange={(event) => setDraft({ ...draft, prepDays: Number(event.target.value) })}
                      />
                    </label>
                    <label className="field">
                      <span>Primary area</span>
                      <input
                        value={draft.primaryArea}
                        onChange={(event) => setDraft({ ...draft, primaryArea: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Supporting areas</span>
                      <input
                        value={draft.supportingAreas}
                        placeholder="Skills, Weave Tools"
                        onChange={(event) => setDraft({ ...draft, supportingAreas: event.target.value })}
                      />
                    </label>
                    <label className="field field--wide">
                      <span>Deep Thought project</span>
                      <input
                        value={draft.obsidianUrl}
                        placeholder="obsidian://open?vault=Deep%20Thought&file=…"
                        onChange={(event) => setDraft({ ...draft, obsidianUrl: event.target.value })}
                      />
                    </label>
                  </div>

                </form>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root
        direction="right"
        handleOnly
        open={blackoutOpen}
        onOpenChange={setBlackoutOpen}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="drawer-overlay" />
          <Drawer.Content className="blackout-dialog drawer-panel">
            <header className="inspector-header">
              <div>
                <Drawer.Title>Blackouts</Drawer.Title>
                <Drawer.Description>Prep skips these dates</Drawer.Description>
              </div>
              <div className="inspector-header-actions" data-vaul-no-drag>
                <button className="icon-action" type="button" onClick={closeBlackouts} aria-label="Close blackouts">
                  ×
                </button>
              </div>
            </header>
            <div className="blackout-list" data-vaul-no-drag>
              {data?.blackouts.map((blackout) => (
                <div className="blackout-item" key={blackout.id}>
                  <span>
                    <strong>{blackout.label}</strong>
                    <small>{dateWindow(blackout.startOn, blackout.endOn)}</small>
                  </span>
                  <button type="button" onClick={() => removeBlackout(blackout.id)}>Remove</button>
                </div>
              ))}
            </div>
            <form className="blackout-form" onSubmit={addBlackout} data-vaul-no-drag>
          <label className="field field--wide">
            <span>Name</span>
            <input
              required
              value={blackoutDraft.label}
              onChange={(event) => setBlackoutDraft({ ...blackoutDraft, label: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Start</span>
            <input
              required
              type="date"
              data-empty={!blackoutDraft.startOn}
              value={blackoutDraft.startOn}
              onChange={(event) => setBlackoutDraft({ ...blackoutDraft, startOn: event.target.value })}
            />
          </label>
          <label className="field">
            <span>End</span>
            <input
              required
              type="date"
              data-empty={!blackoutDraft.endOn}
              min={blackoutDraft.startOn}
              value={blackoutDraft.endOn}
              onChange={(event) => setBlackoutDraft({ ...blackoutDraft, endOn: event.target.value })}
            />
          </label>
              <button className="primary-action" type="submit">Add blackout</button>
            </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </main>
  );
}
