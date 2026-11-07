import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { I18nError } from "./i18n";
import type { PM } from "./pm";

/** Path of the pkgscan binary built by agent/build.ps1. */
export function agentPath(): string {
  if (process.env.LIBPACK_AGENT_PATH) return process.env.LIBPACK_AGENT_PATH;
  const goos = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform as string] ?? process.platform;
  const goarch = { x64: "amd64", arm64: "arm64" }[process.arch as string] ?? process.arch;
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.resolve(process.cwd(), "..", "agent", "dist", `pkgscan-${goos}-${goarch}${ext}`);
}

const running = new Map<PM, Promise<string>>();

/**
 * Runs our own `pkgscan scan` binary (fixed path, fixed args, no shell).
 * pkgscan itself never starts processes and never runs npm.
 */
export function runScan(pm: PM): Promise<string> {
  const cur = running.get(pm);
  if (cur) return cur;
  const bin = agentPath();
  if (!existsSync(/*turbopackIgnore: true*/ bin)) {
    return Promise.reject(new I18nError("scan.agentMissing", { path: bin }));
  }
  const p = new Promise<string>((resolve, reject) => {
    execFile(/*turbopackIgnore: true*/ bin, ["scan", "--manager", pm], { timeout: 15 * 60_000, windowsHide: true, shell: false }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  }).finally(() => {
    running.delete(pm);
  });
  running.set(pm, p);
  return p;
}
