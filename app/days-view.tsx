import Image from "next/image";
import { Drawer } from "vaul";
import { SafeMarkdown } from "./safe-markdown";
import {
  hasEndOfDayBriefContent,
  splitDailyNote,
  type DailyNote,
  type HistoryItem,
} from "./daily-note";
import { calendarDates, monthLabel, shiftMonth, WEEKDAYS } from "./calendar";

export {
  localDateForTimestamp,
  type DailyNote,
  type HistoryItem,
} from "./daily-note";

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

type DaysViewProps = {
  visibleMonth: string;
  today: string;
  minimumDate: string;
  notes: DailyNote[];
  notesState: "loading" | "available" | "unavailable" | "error";
  notesError?: string;
  onChangeMonth: (month: string) => void;
  onOpenDate: (date: string) => void;
};

export function DaysView({
  visibleMonth,
  today,
  minimumDate,
  notes,
  notesState,
  notesError,
  onChangeMonth,
  onOpenDate,
}: DaysViewProps) {
  const reflectedDates = new Set(
    notes
      .filter((note) => hasEndOfDayBriefContent(note.markdown))
      .map((note) => note.date)
  );
  const previousMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const firstMonth = minimumDate.slice(0, 7);
  const currentMonth = today.slice(0, 7);

  return (
    <div className="calendar-view">
      <header className="calendar-header">
        <button
          className="icon-action calendar-month-action"
          type="button"
          aria-label="Previous month"
          disabled={visibleMonth <= firstMonth}
          onClick={() => onChangeMonth(previousMonth)}
        >
          ‹
        </button>
        <h2>{monthLabel(visibleMonth)}</h2>
        <button
          className="icon-action calendar-month-action"
          type="button"
          aria-label="Next month"
          disabled={visibleMonth >= currentMonth}
          onClick={() => onChangeMonth(nextMonth)}
        >
          ›
        </button>
      </header>

      <div className="calendar-grid" role="grid" aria-label={monthLabel(visibleMonth)}>
        {WEEKDAYS.map((weekday) => (
          <div className="calendar-weekday" role="columnheader" key={weekday}>
            {weekday}
          </div>
        ))}
        {calendarDates(visibleMonth).map((date, index) => {
          if (!date) return <div className="calendar-day-spacer" role="gridcell" key={`empty-${index}`} />;
          const hasReflection = reflectedDates.has(date);
          const disabled = date < minimumDate || date > today;
          return (
            <button
              className={`calendar-day${date === today ? " calendar-day--today" : ""}${hasReflection ? " calendar-day--noted" : ""}`}
              type="button"
              role="gridcell"
              key={date}
              disabled={disabled}
              aria-label={`${fullDate(date)}${hasReflection ? ", End Of Day Brief recorded" : ", no End Of Day Brief"}`}
              onClick={() => onOpenDate(date)}
            >
              <span className="calendar-day-number">{Number(date.slice(-2))}</span>
              {hasReflection ? <span className="calendar-note-indicator" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      {notesState !== "available" ? (
        <p className="calendar-source-state">
          {notesState === "loading"
            ? "Reading Deep Thought…"
            : notesState === "unavailable"
              ? "End Of Day indicators are available in the local Mac app."
              : notesError || "Deep Thought is unavailable."}
        </p>
      ) : null}
    </div>
  );
}

type DayRecordDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  note?: DailyNote;
  completed: HistoryItem[];
  notesState: "loading" | "available" | "unavailable" | "error";
  notesError?: string;
  historyError?: string;
};

export function DayRecordDrawer({
  open,
  onOpenChange,
  date,
  note,
  completed,
  notesState,
  notesError,
  historyError,
}: DayRecordDrawerProps) {
  const reflection = splitDailyNote(note?.markdown ?? "").reflection;

  return (
    <Drawer.Root direction="right" handleOnly open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="drawer-overlay" />
        <Drawer.Content className="inspector drawer-panel day-drawer">
          <div className="inspector-layout">
            <header className="inspector-header">
              <div className="inspector-heading">
                <Drawer.Title>{fullDate(date)}</Drawer.Title>
                <Drawer.Description>
                  {note ? "Daily Note logged" : "No Daily Note logged"}
                </Drawer.Description>
                {note ? (
                  <nav className="task-source-links" aria-label="Daily Note links" data-vaul-no-drag>
                    <a
                      className="task-source-link task-source-link--obsidian"
                      href={note.obsidianUrl}
                      aria-label="Open in Obsidian"
                    >
                      <Image src="/brands/obsidian.svg" alt="" width={12} height={12} />
                      <span>Obsidian</span>
                    </a>
                  </nav>
                ) : null}
              </div>
              <div className="inspector-header-actions" data-vaul-no-drag>
                <button
                  className="icon-action"
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close day"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="inspector-view day-drawer-view" data-vaul-no-drag>
              <section className="inspector-section day-drawer-section" aria-labelledby="day-completed-heading">
                <div className="section-heading">
                  <h3 id="day-completed-heading">Completed</h3>
                  <span className="day-completed-source-logo" role="img" aria-label="Asana" />
                </div>
                {historyError ? (
                  <p className="detail-prose detail-prose--empty">{historyError}</p>
                ) : completed.length ? (
                  <ul className="day-completed-list">
                    {completed.map((item) => (
                      <li key={item.id}>
                        <span className="day-completed-mark" aria-hidden="true">✓</span>
                        <span>
                          {item.asanaUrl ? (
                            <a href={item.asanaUrl} target="_blank" rel="noreferrer">{item.displayTitle}</a>
                          ) : (
                            <strong>{item.displayTitle}</strong>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="detail-prose detail-prose--empty">
                    No Asana-confirmed completions were recorded for this day.
                  </p>
                )}
              </section>

              <section className="inspector-section day-drawer-section" aria-labelledby="day-reflection-heading">
                <h3 id="day-reflection-heading">Reflection</h3>
                {reflection ? (
                  <SafeMarkdown markdown={reflection} />
                ) : notesState === "loading" ? (
                  <p className="detail-prose detail-prose--empty">Reading Deep Thought…</p>
                ) : notesState === "unavailable" ? (
                  <p className="detail-prose detail-prose--empty">
                    Daily Notes are available in the local Mac app.
                  </p>
                ) : notesState === "error" ? (
                  <p className="detail-prose detail-prose--empty">
                    {notesError || "Deep Thought is unavailable."}
                  </p>
                ) : note ? (
                  <p className="detail-prose detail-prose--empty">
                    No End Of Day Brief was recorded for this day.
                  </p>
                ) : (
                  <p className="detail-prose detail-prose--empty">
                    No Daily Note was logged for this day.
                  </p>
                )}
              </section>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
