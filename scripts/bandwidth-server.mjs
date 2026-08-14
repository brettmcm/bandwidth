import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectDirectory = process.cwd();
const vinextCLI = resolve(projectDirectory, "node_modules/vinext/dist/cli.js");
const host = process.env.BANDWIDTH_HOST || "127.0.0.1";
const port = process.env.BANDWIDTH_PORT || "3000";

if (!existsSync(vinextCLI)) {
  console.error(`Vinext was not found at ${vinextCLI}. Run npm install first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [vinextCLI, "dev", "--hostname", host, "--port", port], {
  cwd: projectDirectory,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
  stdio: "inherit",
  detached: true,
});

console.log(`[Bandwidth coordinator] pid=${process.pid} child=${child.pid} url=http://${host}:${port}/`);

let shuttingDown = false;

function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Bandwidth coordinator] forwarding ${signal} to child process group ${child.pid}`);

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
process.on("SIGHUP", () => stop("SIGHUP"));

child.on("error", (error) => {
  console.error("Unable to launch Vinext:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
