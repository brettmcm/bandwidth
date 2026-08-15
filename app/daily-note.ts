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

function extractLevelThreeSection(markdown: string, titles: string | string[]) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const escapedTitles = (Array.isArray(titles) ? titles : [titles])
    .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const heading = new RegExp(`^###\\s+(?:${escapedTitles.join("|")})\\s*$`, "i");
  const start = lines.findIndex((line) => heading.test(line));

  if (start === -1) return { content: "", remaining: markdown.trim() };

  const relativeEnd = lines.slice(start + 1).findIndex((line) => /^#{1,3}\s+/.test(line));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return {
    content: lines.slice(start + 1, end).join("\n").trim(),
    remaining: [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim(),
  };
}

export function splitMorningBrief(markdown: string) {
  const primary = extractLevelThreeSection(markdown, "Primary focus");
  const profile = extractLevelThreeSection(primary.remaining, "Focus profile");
  return {
    primaryFocus: primary.content,
    focusProfile: profile.content,
    remaining: profile.remaining,
  };
}

export function splitTodayPlan(markdown: string) {
  const shape = extractLevelThreeSection(markdown, ["Today’s shape", "Today's shape"]);
  const tasks = extractLevelThreeSection(shape.remaining, "Key tasks");
  return {
    shape: shape.content,
    keyTasks: tasks.content,
    remaining: tasks.remaining,
  };
}

export function countKeyTasks(markdown: string) {
  const bullets = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.match(/^\s*[-*+]\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  if (
    bullets.length === 1 &&
    bullets[0].toLowerCase() === "no eligible tasks surfaced in reminders or asana."
  ) {
    return 0;
  }

  return bullets.length;
}
