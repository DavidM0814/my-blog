// 글을 쓰면서 확인하는 로컬 서버. 글 목록은 요청할 때마다 새로 만든다.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { buildIndex } = require("./build-index.js");

const ROOT = path.join(__dirname, "..");
const HOST = "127.0.0.1";
// 다른 포트를 쓰려면 node tools/serve.js 8001 처럼 실행한다.
const PORT = Number.parseInt(process.argv[2], 10) || 8000;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(request, response, status, contentType, body) {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-cache" });
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendIndex(request, response) {
  try {
    const body = JSON.stringify(buildIndex());
    send(request, response, 200, CONTENT_TYPES[".json"], body);
  } catch (error) {
    console.error(`글 목록을 만들지 못했습니다.\n${error.message}`);
    send(request, response, 500, "text/plain; charset=utf-8", error.message);
  }
}

function sendFile(request, response, pathname) {
  const notFound = () => send(request, response, 404, "text/plain; charset=utf-8", "Not Found");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return notFound();

  const filePath = path.join(ROOT, ...(segments.length > 0 ? segments : ["index.html"]));
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) return notFound();

  fs.readFile(filePath, (error, data) => {
    if (error) return notFound();
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    send(request, response, 200, type, data);
  });
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return send(request, response, 405, "text/plain; charset=utf-8", "Method Not Allowed");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
  } catch {
    return send(request, response, 400, "text/plain; charset=utf-8", "Bad Request");
  }

  if (pathname === "/posts/index.json") return sendIndex(request, response);
  return sendFile(request, response, pathname);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`블로그가 이미 켜져 있는 것 같습니다. 브라우저에서 http://localhost:${PORT} 을 열어 보세요.`);
    console.error(`다른 프로그램이 ${PORT}번 포트를 쓰고 있다면 그 프로그램을 먼저 꺼 주세요.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`블로그 주소: http://localhost:${PORT} (끄려면 Ctrl+C)`);
});
