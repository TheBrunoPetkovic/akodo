import React from "react";

type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "del"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function renderInline(node: InlineNode, key: number): React.ReactNode {
  switch (node.type) {
    case "text":
      return node.value;
    case "strong":
      return <strong key={key} className="font-semibold text-ctp-text">{node.children.map(renderInline)}</strong>;
    case "em":
      return <em key={key} className="italic">{node.children.map(renderInline)}</em>;
    case "del":
      return <del key={key}>{node.children.map(renderInline)}</del>;
    case "code":
      return <code key={key} className="rounded bg-ctp-surface0 px-1 py-0.5 font-mono text-[0.85em] text-ctp-pink">{node.value}</code>;
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ctp-sapphire underline decoration-ctp-sapphire/40 underline-offset-2 hover:text-ctp-blue"
        >
          {node.children.map(renderInline)}
        </a>
      );
  }
}

function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  let text = "";
  const flushText = () => {
    if (text) {
      nodes.push({ type: "text", value: text });
      text = "";
    }
  };

  const tokenPattern = /(\*\*|__|~~|\*|_|`|\[[^\]]*\]\()/g;
  while (i < input.length) {
    const rest = input.slice(i);
    tokenPattern.lastIndex = 0;
    const token = tokenPattern.exec(rest);
    const start = token ? token.index : -1;

    if (token && start > 0) {
      text += input.slice(i, i + start);
      i += start;
    }
    if (!token) {
      text += rest;
      break;
    }

    const marker = token[0];
    const afterMarker = input.slice(i + marker.length);
    if (marker === "`") {
      flushText();
      const end = afterMarker.indexOf("`");
      if (end >= 0) {
        nodes.push({ type: "code", value: afterMarker.slice(0, end) });
        i += marker.length + end + 1;
      } else {
        text += marker;
        i += marker.length;
      }
      continue;
    }

    if (marker.startsWith("[") && marker.endsWith("(")) {
      const close = afterMarker.indexOf(")");
      if (close >= 0) {
        const label = marker.slice(1, -2);
        const href = afterMarker.slice(0, close);
        flushText();
        let hrefOut = href.trim();
        if (hrefOut.startsWith("<") && hrefOut.endsWith(">")) hrefOut = hrefOut.slice(1, -1);
        // Only allow http(s) and mailto links to avoid javascript: injection
        if (/^(https?:|mailto:)/i.test(hrefOut)) {
          nodes.push({ type: "link", href: hrefOut, children: parseInline(label) });
        } else {
          nodes.push(...parseInline(label));
        }
        i += marker.length + close + 1;
      } else {
        text += marker;
        i += marker.length;
      }
      continue;
    }

    const closer = marker;
    const end = indexOfClosing(afterMarker, closer);
    if (end >= 0) {
      flushText();
      const inner = afterMarker.slice(0, end);
      const child = { children: parseInline(inner) } as const;
      if (marker === "**" || marker === "__") nodes.push({ type: "strong", ...child });
      else if (marker === "~~") nodes.push({ type: "del", ...child });
      else nodes.push({ type: "em", ...child });
      i += marker.length + end + closer.length;
    } else {
      text += marker;
      i += marker.length;
    }
  }
  flushText();
  return nodes;
}

function indexOfClosing(input: string, closer: string): number {
  const min = closer === "*" || closer === "_" ? 2 : closer.length;
  for (let j = 0; j < input.length - min + 1; j++) {
    if (input.startsWith(closer, j)) {
      // Avoid treating a longer run (e.g. `**` when closing a single `*`) as the close.
      if (closer === "*" && input.startsWith("**", j)) continue;
      if (closer === "_" && input.startsWith("__", j)) continue;
      return j;
    }
  }
  return -1;
}

type Block =
  | { type: "paragraph"; nodes: InlineNode[] }
  | { type: "heading"; level: number; nodes: InlineNode[] }
  | { type: "code"; lang: string; value: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; items: { nodes: InlineNode[]; blocks?: Block[] }[] }
  | { type: "hr" }
  | { type: "html"; value: string };

function parseBlocks(input: string): Block[] {
  const lines = input.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const blank = (line: string) => line.trim() === "";

  while (i < lines.length) {
    const line = lines[i];

    if (blank(line)) { i += 1; continue; }

    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // closing fence
      blocks.push({ type: "code", lang, value: code.join("\n") });
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, nodes: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(quoteLines.join("\n")) });
      continue;
    }

    // List
    const listItem = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (listItem && !/^\d+\.\s*$/.test(line)) {
      const ordered = /\d+\./.test(listItem[2]);
      const markerType = listItem[2].replace(/\d+\./, "1.");
      const items: { nodes: InlineNode[]; blocks?: Block[] }[] = [];
      const indent = listItem[1].length;
      while (i < lines.length) {
        const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (item) {
          const itemOrdered = /\d+\./.test(item[2]);
          const itemType = item[2].replace(/\d+\./, "1.");
          const atSameLevel = item[1].length === indent;
          const sameType = itemOrdered === ordered && itemType === markerType;
          if (atSameLevel && sameType && !/^\d+\.\s*$/.test(lines[i])) {
            items.push({ nodes: parseInline(item[3]) });
            i += 1;
            continue;
          }
          if (!atSameLevel && item[1].length > indent) {
            // nested list: accumulate into previous item blocks
            const nested: string[] = [];
            while (i < lines.length && /^\s*[-*+]|\s*\d+\./.test(lines[i])) {
              nested.push(lines[i]);
              i += 1;
            }
            if (items.length) {
              const last = items[items.length - 1];
              last.blocks = last.blocks ? [...last.blocks, ...parseBlocks(nested.join("\n"))] : parseBlocks(nested.join("\n"));
            }
            continue;
          }
          // A new list (different type) at the same level: stop current list
          break;
        }
        if (blank(lines[i])) {
          i += 1;
          const next = /^(\s*)([-*+]|\d+\.)\s+/.exec(lines[i] ?? "");
          if (!next) break;
          const nextOrdered = /\d+\./.test(next[2]);
          const nextType = next[2].replace(/\d+\./, "1.");
          const same = nextOrdered === ordered && nextType === markerType && next[1].length === indent;
          if (!same) break;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const para: string[] = [];
    while (i < lines.length && !blank(lines[i])) {
      const current = lines[i];
      if (
        /^(```|#{1,6}\s)/.test(current) ||
        /^\s*>/.test(current) ||
        /^(\s*[-*+]|\s*\d+\.)\s+/.test(current) ||
        /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(current)
      ) break;
      para.push(current);
      i += 1;
    }
    blocks.push({ type: "paragraph", nodes: parseInline(para.join("\n")) });
  }

  return blocks;
}

function renderBlock(block: Block, key: number, inQuote: boolean): React.ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key} className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{block.nodes.map(renderInline)}</p>;
    case "heading": {
      const text = block.nodes.map(renderInline);
      const className = "font-semibold text-ctp-text mt-3 mb-1.5 leading-snug";
      switch (block.level) {
        case 1: return <h1 key={key} className={`${className} text-lg`}>{text}</h1>;
        case 2: return <h2 key={key} className={`${className} text-base`}>{text}</h2>;
        case 3: return <h3 key={key} className={`${className} text-[15px]`}>{text}</h3>;
        default: return <h4 key={key} className={`${className} text-sm`}>{text}</h4>;
      }
    }
    case "code":
      return (
        <pre key={key} className="my-2 overflow-x-auto rounded-lg border border-ctp-surface0 bg-ctp-base p-3 font-mono text-[13px] leading-relaxed text-ctp-subtext1">
          <code>{block.value}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={key} className="my-2 border-l-2 border-ctp-surface2 pl-3 text-ctp-subtext0">
          {block.blocks.map((child, index) => renderBlock(child, index, true))}
        </blockquote>
      );
    case "list":
      return block.ordered ? (
        <ol key={key} className="my-1.5 list-decimal pl-5 marker:text-ctp-subtext0">
          {block.items.map((item, index) => (
            <li key={index} className="my-0.5 leading-relaxed">
              {item.nodes.map(renderInline)}
              {item.blocks && item.blocks.map((child, childIndex) => renderBlock(child, childIndex, inQuote))}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="my-1.5 list-disc pl-5 marker:text-ctp-subtext0">
          {block.items.map((item, index) => (
            <li key={index} className="my-0.5 leading-relaxed">
              {item.nodes.map(renderInline)}
              {item.blocks && item.blocks.map((child, childIndex) => renderBlock(child, childIndex, inQuote))}
            </li>
          ))}
        </ul>
      );
    case "hr":
      return <hr key={key} className="my-3 border-ctp-surface0" />;
    case "html":
      return <div key={key} className="my-1.5 text-ctp-subtext1">{escapeHtml(block.value)}</div>;
  }
}

export default function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return <div className="text-sm text-ctp-text">{blocks.map((block, index) => renderBlock(block, index, false))}</div>;
}
