// Shared by the browser suites: launch an installed Chrome or Edge (no browser download needed).
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const BASE = process.env.BASE ?? "http://localhost:8080";
export const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "output");
mkdirSync(OUTPUT, { recursive: true });
/** Where a screenshot goes: tests/output/<name> (git-ignored). */
export const out = (name) => path.join(OUTPUT, name);

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export function launchBrowser(options = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    console.error("No Chrome or Edge found. Install one, or set CHROME_PATH to its executable.");
    process.exit(2);
  }
  return chromium.launch({ executablePath, headless: true, ...options });
}
