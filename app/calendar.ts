export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${value}-01T12:00:00`)
  );
}

export function shiftMonth(value: string, amount: number) {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function calendarDates(value: string) {
  const [year, month] = value.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const dayCount = new Date(year, month, 0, 12).getDate();
  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(`${value}-${String(day).padStart(2, "0")}`);
  }

  while (cells.length % 7) cells.push(null);
  return cells;
}
