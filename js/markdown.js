export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 이미 이스케이프된 주소를 받는다. 제어 문자를 지운 뒤 scheme을 검사한다.
function safeUrl(url) {
  const decoded = url.replace(/&amp;/g, "&").replace(/[\u0000- ]/g, "");
  const scheme = decoded.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return decoded.includes("&#") ? "#" : url;
  return ["http", "https", "mailto"].includes(scheme[1].toLowerCase()) ? url : "#";
}

function renderInline(source) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let text = escapeHtml(source.replace(/\u0000/g, ""));
  text = text.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
    keep(`<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`));
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
    `${keep(`<a href="${safeUrl(url)}">`)}${label}${keep("</a>")}`);
  text = text.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(?=\S)(.+?)(?<=\S)__/g, "<strong>$1</strong>");
  text = text.replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "<em>$1</em>");
  text = text.replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");

  // 링크 안에 코드가 들어갈 수 있으므로 자리표시자가 없어질 때까지 복원한다.
  while (/\u0000\d+\u0000/.test(text)) {
    text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]);
  }
  return text;
}

const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const QUOTE = /^ {0,3}>\s?/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line) {
  const cells = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableStart(lines, i) {
  return lines[i].includes("|")
    && i + 1 < lines.length
    && lines[i + 1].includes("-")
    && (lines[i + 1].includes("|") || splitRow(lines[i]).length === 1)
    && TABLE_DIVIDER.test(lines[i + 1])
    && splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
}

function startsBlock(lines, i) {
  const line = lines[i];
  return HR.test(line) || HEADING.test(line) || FENCE.test(line) || QUOTE.test(line)
    || LIST_ITEM.test(line) || isTableStart(lines, i);
}

function renderTable(rows, divider) {
  const aligns = splitRow(divider).map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return cell.startsWith(":") ? "left" : "";
  });
  const renderCells = (row, tag) => aligns.map((align, i) => {
    const style = align ? ` style="text-align:${align}"` : "";
    return `<${tag}${style}>${renderInline(row[i] ?? "")}</${tag}>`;
  }).join("");
  const body = rows.slice(1).map((row) => `<tr>${renderCells(row, "td")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${renderCells(rows[0], "th")}</tr></thead>`
    + `<tbody>${body}</tbody></table></div>`;
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_ITEM);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const match = lines[i].match(LIST_ITEM);
    if (!match || match[1].length !== baseIndent || /\d/.test(match[2]) !== ordered || HR.test(lines[i])) break;

    const contentIndent = baseIndent + match[2].length + 1;
    const children = [];
    i += 1;
    while (i < lines.length) {
      const indent = lines[i].match(/^\s*/)[0].length;
      if (lines[i].trim() === "") {
        let next = i + 1;
        while (next < lines.length && lines[next].trim() === "") next += 1;
        if (next === lines.length || lines[next].match(/^\s*/)[0].length <= baseIndent) break;
        children.push("");
      } else if (indent > baseIndent) {
        children.push(lines[i].slice(Math.min(indent, contentIndent)));
      } else {
        break;
      }
      i += 1;
    }
    items.push(`<li>${renderInline(match[3])}${children.length ? renderBlocks(children) : ""}</li>`);

    let next = i;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    const nextItem = next < lines.length && lines[next].match(LIST_ITEM);
    if (!nextItem || nextItem[1].length !== baseIndent) break;
    i = next;
  }

  const tag = ordered ? "ol" : "ul";
  const number = ordered ? Number.parseInt(first[2], 10) : 1;
  const startAttr = number !== 1 ? ` start="${number}"` : "";
  return { html: `<${tag}${startAttr}>${items.join("")}</${tag}>`, next: i };
}

function renderBlocks(lines) {
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      const code = [];
      i += 1;
      while (i < lines.length && !close.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : "";
      html.push(`<pre><code${lang}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (HR.test(line)) {
      html.push("<hr>");
      i += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE, ""));
        i += 1;
      }
      html.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const list = renderList(lines, i);
      html.push(list.html);
      i = list.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const rows = [splitRow(line)];
      const divider = lines[i + 1];
      i += 2;
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      html.push(renderTable(rows, divider));
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

export function markdownToHtml(source) {
  return renderBlocks(source.replace(/\r\n?/g, "\n").split("\n"));
}
