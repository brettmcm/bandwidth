import { Fragment, type JSX, type ReactNode } from "react";

type ListPresentation = "default" | "schedule" | "tasks";

function morningBriefListIcon(
  item: string,
  presentation: ListPresentation,
  taskState?: "open" | "complete"
) {
  if (taskState === "complete") return "task-complete";
  if (presentation === "tasks" || taskState === "open") return "task";
  if (presentation !== "schedule") return null;

  const normalized = item.toLowerCase();
  if (/\b(zoom|meet|meeting|call|warmup|sync|review)\b/.test(normalized)) return "video";
  if (/\b(focus|deep work|draft|write|writing|design)\b/.test(normalized)) return "focus";
  return "calendar";
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "obsidian:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function obsidianLink(target: string) {
  const [file] = target.split("#", 1);
  const query = new URLSearchParams({ vault: "Deep Thought", file });
  return `obsidian://open?${query.toString()}`;
}

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(!?\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("![[")) {
      const target = token.slice(3, -2).split("|", 1)[0];
      nodes.push(<span className="markdown-embed" key={key}>Attachment: {target}</span>);
    } else if (token.startsWith("[[")) {
      const [target, label] = token.slice(2, -2).split("|", 2);
      nodes.push(
        <a href={obsidianLink(target)} key={key} target="_blank" rel="noreferrer">
          {label || target}
        </a>
      );
    } else if (token.startsWith("![")) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const label = image?.[1] || image?.[2]?.split("/").at(-1) || "Image";
      nodes.push(<span className="markdown-embed" key={key}>Image: {label}</span>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeLink(link[2]) : null;
      nodes.push(
        href ? (
          <a href={href} key={key} target="_blank" rel="noreferrer">
            {link?.[1]}
          </a>
        ) : (
          <Fragment key={key}>{link?.[1] ?? token}</Fragment>
        )
      );
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key}>{inlineMarkdown(token.slice(2, -2), `${key}-strong`)}</strong>
      );
    } else {
      nodes.push(<em key={key}>{inlineMarkdown(token.slice(1, -1), `${key}-em`)}</em>);
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function isBlockStart(line: string) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*(---+|___+|\*\*\*+)\s*$/.test(line)
  );
}

export function SafeMarkdown({
  markdown,
  listPresentation = "default",
}: {
  markdown: string;
  listPresentation?: ListPresentation;
}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([^\s]*)/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`} data-language={fence[1] || undefined}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const content = inlineMarkdown(heading[2], `heading-${index}`);
      const Heading = `h${level}` as keyof JSX.IntrinsicElements;
      blocks.push(<Heading key={`heading-${index}`}>{content}</Heading>);
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])\]\s*(.*)$/);
            const taskState = task ? (task[1] === " " ? "open" : "complete") : undefined;
            const icon = morningBriefListIcon(item, listPresentation, taskState);
            const className = [
              task ? "markdown-task" : "",
              icon ? "markdown-list-item--decorated" : "",
            ].filter(Boolean).join(" ") || undefined;
            return (
              <li key={itemIndex} className={className}>
                {icon ? (
                  <span
                    className={`markdown-item-symbol markdown-item-symbol--${icon}`}
                    data-symbol={icon}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="markdown-list-copy">
                  {inlineMarkdown(task?.[2] ?? item, `list-${index}-${itemIndex}`)}
                </span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <span className="markdown-list-copy">
                {inlineMarkdown(item, `ordered-${index}-${itemIndex}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          <SafeMarkdown markdown={quote.join("\n")} />
        </blockquote>
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {inlineMarkdown(paragraph.join(" "), `paragraph-${index}`)}
      </p>
    );
  }

  return <div className="safe-markdown">{blocks}</div>;
}
