// posts/*.md의 맨 위 정보 블록을 읽어 글 목록(posts/index.json)을 만든다.
const fs = require("node:fs");
const path = require("node:path");

const POSTS_DIR = path.join(__dirname, "..", "posts");
const INDEX_PATH = path.join(POSTS_DIR, "index.json");
const SLUG = /^[a-z0-9-]+$/;
const FRONT_MATTER = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

function parseFrontMatter(source) {
  const match = source.match(FRONT_MATTER);
  if (!match) return null;

  const fields = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    fields[key] = line.slice(colon + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: source.slice(match[0].length) };
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseTags(value = "") {
  const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
  return [...new Set(tags)];
}

// 검색에 쓸 수 있도록 마크다운 기호를 지운 본문을 만든다.
function toSearchText(body) {
  return body
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gm, " ")
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*`]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readPost(fileName, errors) {
  const slug = path.basename(fileName, ".md");
  const source = fs.readFileSync(path.join(POSTS_DIR, fileName), "utf8")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
  const fileErrors = [];

  if (!SLUG.test(slug)) {
    fileErrors.push("파일 이름은 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.");
  }

  const parsed = parseFrontMatter(source);
  if (!parsed) {
    fileErrors.push("파일 맨 위에 --- 로 둘러싼 정보 블록이 없습니다.");
  } else {
    if (!parsed.fields.title) fileErrors.push("title이 없습니다.");
    if (!parsed.fields.date) {
      fileErrors.push("date가 없습니다.");
    } else if (!isValidDate(parsed.fields.date)) {
      fileErrors.push(`date는 2026-11-01 형식의 실제 날짜여야 합니다: ${parsed.fields.date}`);
    }
  }

  if (fileErrors.length > 0) {
    errors.push(...fileErrors.map((message) => `${fileName}: ${message}`));
    return null;
  }

  return {
    slug,
    title: parsed.fields.title,
    date: parsed.fields.date,
    summary: parsed.fields.summary ?? "",
    tags: parseTags(parsed.fields.tags),
    text: toSearchText(parsed.body),
  };
}

function buildIndex() {
  const errors = [];
  const fileNames = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith(".md"));
  const posts = fileNames.map((name) => readPost(name, errors)).filter(Boolean);

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

if (require.main === module) {
  try {
    const posts = buildIndex();
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(posts, null, 2)}\n`);
    console.log(`글 ${posts.length}개로 posts/index.json을 만들었습니다.`);
  } catch (error) {
    console.error(`글 목록을 만들지 못했습니다.\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildIndex };
