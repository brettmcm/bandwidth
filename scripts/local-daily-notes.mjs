import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

const DAILY_NOTE_FILENAME = /^\d{4}-\d{2}-\d{2}\.md$/;

function expandedPath(value) {
  if (value === "~") return homedir();
  if (value.startsWith(`~${sep}`)) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

function isInside(parent, candidate) {
  const childPath = relative(parent, candidate);
  return childPath !== "" && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath);
}

async function readJson(path, unavailableMessage, invalidMessage) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new Error(unavailableMessage);
  }

  try {
    return JSON.parse(source);
  } catch {
    throw new Error(invalidMessage);
  }
}

function obsidianUrl(vaultName, relativePath) {
  const query = new URLSearchParams({ vault: vaultName, file: relativePath });
  return `obsidian://open?${query.toString()}`;
}

export async function listDailyNotes({
  registryPath = resolve(homedir(), ".codex/obsidian-vaults.json"),
} = {}) {
  const registry = await readJson(
    registryPath,
    "Deep Thought’s vault registry could not be read.",
    "Deep Thought’s vault registry is not configured correctly.",
  );
  const vault = registry?.vaults?.[registry?.default_vault];
  if (
    !vault ||
    typeof vault.canonical_path !== "string" ||
    !vault.canonical_path.trim() ||
    typeof vault.display_name !== "string" ||
    !vault.display_name.trim()
  ) {
    throw new Error("Deep Thought’s vault registry is not configured correctly.");
  }

  let vaultRoot;
  try {
    vaultRoot = await realpath(expandedPath(vault.canonical_path));
  } catch {
    throw new Error("The canonical Deep Thought vault is unavailable.");
  }

  const configuration = await readJson(
    resolve(vaultRoot, ".obsidian/daily-notes.json"),
    "Obsidian’s Daily Notes folder is not configured.",
    "Obsidian’s Daily Notes folder is not configured.",
  );
  if (typeof configuration?.folder !== "string" || !configuration.folder.trim()) {
    throw new Error("Obsidian’s Daily Notes folder is not configured.");
  }

  const configuredNotesDirectory = resolve(vaultRoot, configuration.folder);
  if (!isInside(vaultRoot, configuredNotesDirectory)) {
    throw new Error("Obsidian’s Daily Notes folder must stay inside Deep Thought.");
  }

  let notesDirectory;
  try {
    notesDirectory = await realpath(configuredNotesDirectory);
  } catch {
    throw new Error("Deep Thought’s Daily Notes folder is unavailable.");
  }
  if (!isInside(vaultRoot, notesDirectory)) {
    throw new Error("Obsidian’s Daily Notes folder must stay inside Deep Thought.");
  }

  let entries;
  try {
    entries = await readdir(notesDirectory, { withFileTypes: true });
  } catch {
    throw new Error("Deep Thought’s Daily Notes folder is unavailable.");
  }

  const folderPath = configuration.folder
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
  const dailyNotes = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && DAILY_NOTE_FILENAME.test(entry.name))
      .map(async (entry) => {
        const path = resolve(notesDirectory, entry.name);
        const [markdown, metadata] = await Promise.all([
          readFile(path, "utf8"),
          stat(path),
        ]);
        const relativePath = `${folderPath}/${entry.name}`;
        return {
          date: entry.name.slice(0, -3),
          relativePath,
          modifiedAt: metadata.mtime.toISOString(),
          markdown,
          obsidianUrl: obsidianUrl(vault.display_name, relativePath),
        };
      }),
  );

  return dailyNotes.sort((first, second) => second.date.localeCompare(first.date));
}
