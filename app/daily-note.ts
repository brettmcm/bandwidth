export type DailyNote = {
  date: string;
  relativePath: string;
  modifiedAt: string;
  markdown: string;
  obsidianUrl: string;
};

export type HistoryItem = {
  id: string;
  displayTitle: string;
  completedAt: string;
  primaryArea: string;
  requestType: string | null;
  asanaUrl: string | null;
};

export function localDateForTimestamp(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function splitDailyNote(markdown: string) {
  const sections = {
    planned: [] as string[],
    reflection: [] as string[],
    fallback: [] as string[],
  };
  let current: keyof typeof sections = "fallback";
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^##\s+Morning Brief\s*$/i.test(line)) {
      current = "planned";
      continue;
    }
    if (/^##\s+End Of Day Brief\s*$/i.test(line)) {
      current = "reflection";
      continue;
    }
    sections[current].push(line);
  }
  return {
    planned: sections.planned.join("\n").trim(),
    reflection: sections.reflection.join("\n").trim(),
    fallback: sections.fallback.join("\n").trim(),
  };
}
