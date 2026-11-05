import { escapeHtml, markdownToHtml } from "./markdown.js";

const SITE_TITLE = "My Blog";
const SITE_INTRO = "배우고 생각한 것을 기록합니다.";
const SLUG = /^[a-z0-9-]+$/;
const FRONT_MATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const app = document.getElementById("app");
let renderId = 0;

async function fetchPosts() {
  const response = await fetch("posts/index.json", { cache: "no-cache" });
  if (!response.ok) {
    const error = new Error(`글 목록을 불러오지 못했습니다: ${response.status}`);
    // 로컬 서버는 잘못 작성된 글의 내용을 글자로 알려 준다.
    if (response.headers.get("content-type")?.startsWith("text/plain")) {
      error.detail = await response.text();
    }
    throw error;
  }
  const posts = await response.json();
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

function normalizeForSearch(text) {
  return text.normalize("NFC").toLowerCase();
}

function matchesSearch(post, terms) {
  const target = normalizeForSearch([post.title, post.summary, ...post.tags, post.text].join(" "));
  return terms.every((term) => target.includes(term));
}

function renderMessage(title, message) {
  document.title = `${title} - ${SITE_TITLE}`;
  app.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="message">${escapeHtml(message)}</p>
    <a class="back-link" href="#/">← 글 목록으로</a>`;
}

function renderTags(tags) {
  if (tags.length === 0) return "";
  const items = tags.map((tag) =>
    `<li><a class="tag" href="#/tags/${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a></li>`).join("");
  return `<ul class="post-tags" aria-label="태그">${items}</ul>`;
}

function renderPostItems(posts) {
  const items = posts.map((post) => `
    <li class="post-item">
      <h2><a href="#/posts/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
      <time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
      ${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}
      ${renderTags(post.tags)}
    </li>`).join("");
  return `<ul class="post-list">${items}</ul>`;
}

async function renderList(id, tag = null) {
  const allPosts = await fetchPosts();
  if (id !== renderId) return;

  const posts = tag === null ? allPosts : allPosts.filter((post) => post.tags.includes(tag));
  if (tag !== null && posts.length === 0) {
    renderMessage("태그를 찾을 수 없습니다", "이 태그가 붙은 글이 없습니다.");
    return;
  }

  document.title = tag === null ? SITE_TITLE : `#${tag} - ${SITE_TITLE}`;
  if (posts.length === 0) {
    app.innerHTML = "<p>아직 작성된 글이 없습니다.</p>";
    return;
  }

  const listHeader = tag === null ? `<p class="site-intro">${escapeHtml(SITE_INTRO)}</p>` : `
    <header class="post-header">
      <h1>#${escapeHtml(tag)}</h1>
      <a href="#/">전체 글 보기</a>
    </header>`;
  app.innerHTML = `
    ${listHeader}
    <input class="search-input" id="search-input" type="search" placeholder="글 검색" aria-label="글 검색" autocomplete="off">
    <p class="search-status" id="search-status" role="status"></p>
    <div id="search-results"></div>`;

  const input = document.getElementById("search-input");
  const status = document.getElementById("search-status");
  const results = document.getElementById("search-results");

  // 입력 중 포커스를 잃지 않도록 검색 결과 영역만 다시 그린다.
  function showResults() {
    const query = input.value.trim();
    const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    const matched = posts.filter((post) => matchesSearch(post, terms));
    status.textContent = terms.length > 0 ? `검색 결과 ${matched.length}개` : "";
    results.innerHTML = matched.length > 0
      ? renderPostItems(matched)
      : `<p class="message">"${escapeHtml(query)}"에 맞는 글이 없습니다.</p>`;
  }

  input.addEventListener("input", showResults);
  showResults();
}

async function renderPost(id, slug) {
  const posts = await fetchPosts();
  const post = posts.find((candidate) => candidate.slug === slug);
  if (id !== renderId) return;
  if (!post || !SLUG.test(slug)) {
    renderMessage("글을 찾을 수 없습니다", "주소가 바뀌었거나 삭제된 글일 수 있습니다.");
    return;
  }

  const response = await fetch(`posts/${slug}.md`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`글을 불러오지 못했습니다: ${response.status}`);
  const source = await response.text();
  if (id !== renderId) return;

  document.title = `${post.title} - ${SITE_TITLE}`;
  app.innerHTML = `
    <article>
      <header class="post-header">
        <h1>${escapeHtml(post.title)}</h1>
        <time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
        ${renderTags(post.tags)}
      </header>
      <div class="prose">${markdownToHtml(source.replace(FRONT_MATTER, ""))}</div>
    </article>
    <a class="back-link" href="#/">← 글 목록으로</a>`;
}

async function route() {
  const id = ++renderId;
  const hash = location.hash.replace(/^#/, "") || "/";
  const postMatch = hash.match(/^\/posts\/([^/]+)$/);
  const tagMatch = hash.match(/^\/tags\/([^/]+)$/);

  try {
    if (hash === "/") {
      await renderList(id);
    } else if (postMatch) {
      await renderPost(id, decodeSegment(postMatch[1]));
    } else if (tagMatch) {
      await renderList(id, decodeSegment(tagMatch[1]));
    } else {
      renderMessage("페이지를 찾을 수 없습니다", "주소를 다시 확인해 주세요.");
    }
  } catch (error) {
    console.error(error);
    if (id === renderId) {
      renderMessage("문제가 발생했습니다", error.detail ?? "내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (id === renderId) window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
