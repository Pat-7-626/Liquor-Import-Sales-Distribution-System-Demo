/**
 * Renders a document page to an A4 PDF with a headless Chromium (installed in the API image, with Thai
 * fonts). Rendering is offline: the page may not fetch anything, since documents carry prices and
 * customer details. Returns null when no browser is available (e.g. running the API outside Docker), and
 * the caller falls back to attaching the HTML.
 */
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";

const CANDIDATES = [process.env.CHROMIUM_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean) as string[];

let browser: Promise<Browser> | null = null;
const getBrowser = () => {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) return null;
  browser ??= chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] }).catch((e) => {
    browser = null;
    throw e;
  });
  return browser;
};

export async function renderPdf(html: string): Promise<Buffer | null> {
  const launching = getBrowser();
  if (!launching) return null;
  const context = await (await launching).newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    // Nothing leaves the server: only the page itself and inline data.
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
  } finally {
    await context.close();
  }
}

export async function closePdf() {
  const b = browser;
  browser = null;
  if (b) await (await b).close().catch(() => {});
}
