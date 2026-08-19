import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = resolve(homedir(), "Library/Caches/Bandwidth");
const logPath = resolve(cacheDirectory, "browser-server.log");
const coordinatorPath = resolve(projectDirectory, "scripts/bandwidth-server.mjs");

mkdirSync(cacheDirectory, { recursive: true });
const log = openSync(logPath, "a");
const coordinator = spawn(process.execPath, [coordinatorPath, "--mode=dev"], {
  cwd: projectDirectory,
  detached: true,
  env: process.env,
  stdio: ["ignore", log, log],
});
coordinator.unref();
closeSync(log);

console.log(`[Bandwidth launcher] coordinator=${coordinator.pid} log=${logPath}`);
