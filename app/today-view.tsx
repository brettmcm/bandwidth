import { useState } from "react";
import { Drawer } from "vaul";
import {
  countKeyTasks,
  splitDailyNote,
  splitMorningBrief,
  splitTodayPlan,
  type DailyNote,
} from "./daily-note";
import { SafeMarkdown } from "./safe-markdown";

type NotesState = "loading" | "available" | "unavailable" | "error";

type TodayViewProps = {
  date: string;
  note?: DailyNote;
  notesState: NotesState;
  notesError?: string;
};

function dateDisplay(value: string) {
  const date = new Date(`${value}T12:00:00`);

  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
    calendarDate: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
  };
}

function plainMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function PrimaryFocusSentence({ markdown }: { markdown: string }) {
  const normalized = markdown.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(Today(?:’|')s primary focus is to )\*\*(.+)\*\*(\.)$/i);

  if (!match) return <>{plainMarkdown(normalized)}</>;
  return <>{match[1]}<strong>{match[2]}</strong>{match[3]}</>;
}

function FocusCard({ primaryFocus, focusProfile }: { primaryFocus: string; focusProfile: string }) {
  const [profileOpen, setProfileOpen] = useState(false);

  if (!focusProfile) {
    return (
      <div className="today-focus-card today-focus-card--static">
        <span className="today-focus-copy">
          <PrimaryFocusSentence markdown={primaryFocus} />
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        className="today-focus-card"
        type="button"
        aria-label="Open today’s focus profile"
        onClick={() => setProfileOpen(true)}
      >
        <span className="today-focus-copy">
          <PrimaryFocusSentence markdown={primaryFocus} />
        </span>
      </button>

      <Drawer.Root
        direction="right"
        handleOnly
        open={profileOpen}
        onOpenChange={setProfileOpen}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="drawer-overlay" />
          <Drawer.Content className="inspector drawer-panel today-focus-drawer">
            <div className="inspector-layout">
              <header className="inspector-header">
                <div className="inspector-heading">
                  <Drawer.Title>Focus profile</Drawer.Title>
                </div>
                <div className="inspector-header-actions" data-vaul-no-drag>
                  <button
                    className="icon-action"
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    aria-label="Close focus profile"
                  >
                    ×
                  </button>
                </div>
              </header>
              <div className="inspector-view today-focus-drawer-view" data-vaul-no-drag>
                <section
                  className="inspector-section today-focus-drawer-section"
                  aria-label="Focus profile details"
                >
                  <SafeMarkdown markdown={focusProfile} />
                </section>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

function TodayEmptyState({
  notesState,
  notesError,
  hasNote,
}: {
  notesState: NotesState;
  notesError?: string;
  hasNote: boolean;
}) {
  const message = notesState === "loading"
    ? "Reading today’s Daily Note…"
    : notesState === "unavailable"
      ? "Today is available in the local Mac app, where Bandwidth can read Deep Thought."
      : notesState === "error"
        ? notesError || "Deep Thought is unavailable."
        : hasNote
          ? "Today’s Daily Note does not have a Morning Brief yet. Run $hello to add one."
          : "There is no Daily Note for today yet. Run $hello to create the note and Morning Brief.";

  return (
    <div className="today-empty" role="status">
      <span className="today-empty-mark" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function TodayView({ date, note, notesState, notesError }: TodayViewProps) {
  const displayDate = dateDisplay(date);
  const { planned, fallback } = splitDailyNote(note?.markdown ?? "");
  const brief = splitMorningBrief(planned);
  const plan = splitTodayPlan(brief.remaining);
  const keyTaskCount = countKeyTasks(plan.keyTasks);
  const hasStructuredFocus = Boolean(brief.primaryFocus);

  return (
    <div className="today-view">
      <article className="today-note" aria-labelledby="today-date-heading">
        <header className="today-note-header">
          <h2 id="today-date-heading">
            <span className="today-date-weekday">{displayDate.weekday}</span>{" "}
            <span className="today-date-calendar">{displayDate.calendarDate}</span>
          </h2>
        </header>

        {planned ? (
          <section className="today-section today-section--brief" aria-label="Today’s plan">
            {hasStructuredFocus ? (
              <>
                <FocusCard
                  primaryFocus={brief.primaryFocus}
                  focusProfile={brief.focusProfile}
                />
                {plan.shape ? (
                  <div className="today-shape today-brief-list today-brief-list--schedule">
                    <SafeMarkdown markdown={plan.shape} listPresentation="schedule" />
                  </div>
                ) : null}
                {plan.keyTasks ? (
                  <section
                    className="today-key-tasks today-brief-list today-brief-list--tasks"
                    aria-labelledby="today-key-tasks-heading"
                  >
                    <h3 id="today-key-tasks-heading">
                      You have {keyTaskCount} key {keyTaskCount === 1 ? "task" : "tasks"} today
                    </h3>
                    <SafeMarkdown markdown={plan.keyTasks} listPresentation="tasks" />
                  </section>
                ) : null}
                {plan.remaining ? <SafeMarkdown markdown={plan.remaining} /> : null}
              </>
            ) : (
              <SafeMarkdown markdown={planned} />
            )}
          </section>
        ) : (
          <TodayEmptyState
            notesState={notesState}
            notesError={notesError}
            hasNote={Boolean(note)}
          />
        )}

        {fallback ? (
          <section className="today-section" aria-label="Daily Note context">
            <p className="today-section-label">Notes</p>
            <SafeMarkdown markdown={fallback} />
          </section>
        ) : null}

      </article>
    </div>
  );
}
