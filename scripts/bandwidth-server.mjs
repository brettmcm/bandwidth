import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listDailyNotes } from "./local-daily-notes.mjs";

const projectDirectory = process.cwd();
const vinextCLI = resolve(projectDirectory, "node_modules/vinext/dist/cli.js");
const host = "127.0.0.1";
const port = Number(process.env.BANDWIDTH_PORT || "3000");
const notesPort = port + 1;
const requestedMode = process.argv
  .find((argument) => argument.startsWith("--mode="))
  ?.slice("--mode=".length);
const mode = requestedMode === "start" ? "start" : "dev";

if (!Number.isInteger(port) || port < 1 || port >= 65_535) {
  console.error("BANDWIDTH_PORT must be a valid TCP port.");
  process.exit(1);
}

if (!existsSync(vinextCLI)) {
  console.error(`Vinext was not found at ${vinextCLI}. Run npm install first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [vinextCLI, mode, "--hostname", host, "--port", String(port)], {
  cwd: projectDirectory,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
  stdio: "inherit",
  detached: true,
});

const allowedOrigins = new Set([
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
]);

function sendJson(response, status, body, origin) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(payload);
}

const notesServer = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: "This local reader only accepts Bandwidth requests." });
    return;
  }

  const url = new URL(request.url || "/", `http://${host}:${notesPort}`);
  if (request.method !== "GET" || url.pathname !== "/api/daily-notes") {
    sendJson(response, 404, { error: "Not found" }, origin);
    return;
  }

  try {
    const notes = await listDailyNotes();
    sendJson(response, 200, { notes }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deep Thought is unavailable.";
    sendJson(response, 500, { error: message }, origin);
  }
});

notesServer.on("error", (error) => {
  console.error("Unable to launch the local Daily Notes reader:", error);
  stop("SIGTERM");
});

notesServer.listen(notesPort, host, () => {
  console.log(`[Bandwidth daily notes] url=http://${host}:${notesPort}/api/daily-notes`);
});

console.log(`[Bandwidth coordinator] pid=${process.pid} child=${child.pid} url=http://${host}:${port}/ mode=${mode}`);

let shuttingDown = false;

function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Bandwidth coordinator] forwarding ${signal} to child process group ${child.pid}`);
  notesServer.close();

  if (child.pid) {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") console.error(error);
    }
  }

  setTimeout(() => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") console.error(error);
      }
    }
  }, 4_000).unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGHUP", () => {
  console.log("[Bandwidth coordinator] keeping the local services alive after launcher exit");
});

child.on("error", (error) => {
  console.error("Unable to launch Vinext:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
