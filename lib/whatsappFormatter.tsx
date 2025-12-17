import React from "react";

type InlineFormatter = {
  name: string;
  regex: RegExp;
  wrap: (content: React.ReactNode, key: string) => React.ReactNode;
  treatAsAtomic?: boolean;
};

const INLINE_FORMATTERS: InlineFormatter[] = [
  {
    name: "placeholder",
    regex: /(\{\{.*?\}\})/g,
    wrap: (content, key) => (
      <span key={key} className="text-emerald-600 font-semibold">
        {content}
      </span>
    ),
    treatAsAtomic: true,
  },
  {
    name: "code-block",
    regex: /```([^`]+)```/g,
    wrap: (content, key) => (
      <code
        key={key}
        className="rounded bg-slate-100 px-1 text-[11px] font-mono text-slate-600"
      >
        {content}
      </code>
    ),
    treatAsAtomic: true,
  },
  {
    name: "inline-code",
    regex: /`([^`]+)`/g,
    wrap: (content, key) => (
      <code
        key={key}
        className="rounded bg-slate-100 px-1 text-[11px] font-mono text-slate-600"
      >
        {content}
      </code>
    ),
    treatAsAtomic: true,
  },
  {
    name: "bold",
    regex: /\*(?!\s)([^*]+?)\*(?!\s)/g,
    wrap: (content, key) => <strong key={key}>{content}</strong>,
  },
  {
    name: "italic",
    regex: /_(?!\s)([^_]+?)_(?!\s)/g,
    wrap: (content, key) => <em key={key}>{content}</em>,
  },
  {
    name: "strikethrough",
    regex: /~(?!\s)([^~]+?)~(?!\s)/g,
    wrap: (content, key) => <s key={key}>{content}</s>,
  },
];

type FormatterMatch = {
  formatter: InlineFormatter;
  match: RegExpExecArray;
  index: number;
};

function findNextMatch(line: string, startIndex: number): FormatterMatch | null {
  const substring = line.slice(startIndex);
  let earliest: FormatterMatch | null = null;

  INLINE_FORMATTERS.forEach((formatter) => {
    const regex = new RegExp(formatter.regex.source, formatter.regex.flags);
    const match = regex.exec(substring);
    if (!match) return;

    const absoluteIndex = startIndex + match.index;
    if (
      !earliest ||
      absoluteIndex < earliest.index ||
      (absoluteIndex === earliest.index &&
        formatter.name.localeCompare(earliest.formatter.name) < 0)
    ) {
      earliest = {
        formatter,
        match,
        index: absoluteIndex,
      };
    }
  });

  return earliest;
}

function processLine(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const nextMatch = findNextMatch(line, cursor);
    if (!nextMatch) {
      nodes.push(line.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      nodes.push(line.slice(cursor, nextMatch.index));
    }

    const matchedValue = nextMatch.match[1] ?? nextMatch.match[0];
    const innerContent = nextMatch.formatter.treatAsAtomic
      ? matchedValue
      : processLine(
          matchedValue,
          `${keyPrefix}-${nextMatch.formatter.name}`
        );

    const normalizedContent =
      Array.isArray(innerContent) && innerContent.length === 1
        ? innerContent[0]
        : innerContent;

    nodes.push(
      nextMatch.formatter.wrap(
        normalizedContent,
        `${keyPrefix}-${nextMatch.formatter.name}-${nextMatch.index}`
      )
    );

    cursor = nextMatch.index + nextMatch.match[0].length;
  }

  if (nodes.length === 0) {
    return [""];
  }

  return nodes;
}

export function formatBodyLines(body?: string) {
  const lines = (body ? body.split("\n") : ["Body text here"]).map(
    (line) => line || "\u00A0"
  );
  return lines.map((line, idx) => (
    <p
      key={`line-${idx}`}
      className="leading-relaxed text-sm text-slate-700 before:block"
    >
      {processLine(line, `line-${idx}`)}
    </p>
  ));
}

export function renderFormattedLines(
  text?: string | null,
  placeholder = "Body text here"
) {
  const lines = text ? text.split("\n") : [placeholder];
  return lines.map((line, idx) => (
    <p key={`line-${idx}`} className="whitespace-pre-wrap">
      {processLine(line || placeholder, `line-${idx}`)}
    </p>
  ));
}
