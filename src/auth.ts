import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTH_DIR = join(homedir(), ".substack-article-mcp");
const AUTH_FILE = join(AUTH_DIR, "auth.json");
const CHROME_PROFILE_DIR = join(AUTH_DIR, "chrome-profile");

interface StoredAuth {
  substackSid: string;
  extractedAt: string;
  subdomain?: string;
}

export function getAuthDir(): string {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  return AUTH_DIR;
}

export function loadAuth(): StoredAuth | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const raw = readFileSync(AUTH_FILE, "utf-8");
    const data = JSON.parse(raw) as StoredAuth;
    if (!data.substackSid) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveAuth(sid: string, subdomain?: string): void {
  getAuthDir();
  const data: StoredAuth = {
    substackSid: sid,
    extractedAt: new Date().toISOString(),
    subdomain,
  };
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getCookieHeaders(): Record<string, string> {
  const auth = loadAuth();
  if (!auth) {
    throw new Error(
      "Not authenticated. Run `substack-article-mcp login` first to connect your Substack account."
    );
  }
  return {
    Cookie: `substack.sid=${auth.substackSid}; substack.lli=1`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

function findChrome(): string | null {
  const { platform } = process;

  const candidates: string[] = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium"
    );
  } else if (platform === "win32") {
    const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const programFilesX86 =
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData =
      process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local");

    candidates.push(
      join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
    );
  }

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

export async function runLogin(): Promise<void> {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("Could not find Chrome/Chromium on your system.");
    console.error("Install Google Chrome and try again.");
    console.error(
      "\nAlternative: run `substack-article-mcp login --manual` to paste your cookie directly."
    );
    process.exit(1);
  }

  console.log("Launching Chrome for Substack login...");
  console.log(`Chrome: ${chromePath}`);

  // Dynamic import to avoid loading puppeteer when running the MCP server
  const puppeteer = await import("puppeteer-core");

  getAuthDir();

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    userDataDir: CHROME_PROFILE_DIR,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1200,800",
    ],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  await page.goto("https://substack.com/sign-in", {
    waitUntil: "networkidle2",
  });

  console.log("\n┌─────────────────────────────────────────────┐");
  console.log("│  Log in to Substack in the browser window.  │");
  console.log("│  The window will close automatically once    │");
  console.log("│  your session cookie is detected.            │");
  console.log("└─────────────────────────────────────────────┘\n");

  const sid = await waitForCookie(page, "substack.sid", 300_000);

  if (!sid) {
    console.error("Timed out waiting for login. Please try again.");
    await browser.close();
    process.exit(1);
  }

  saveAuth(sid);
  console.log("Cookies saved. Validating...");

  const valid = await validateStoredAuth();
  await browser.close();

  if (valid) {
    console.log("\n✅ Authenticated successfully!");
    console.log(`   Cookies stored in ${AUTH_FILE}`);
    console.log(
      "   You can now use the Substack Article MCP server in Cursor, Claude Code, etc."
    );
  } else {
    console.error(
      "\n⚠️  Cookie was saved but validation failed. You may need to try again."
    );
  }
}

async function waitForCookie(
  page: { createCDPSession(): Promise<{ send(method: string): Promise<unknown>; detach(): Promise<void> }> },
  cookieName: string,
  timeoutMs: number
): Promise<string | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const client = await page.createCDPSession();
      const result = (await client.send("Network.getAllCookies")) as {
        cookies: Array<{ name: string; value: string }>;
      };
      await client.detach();

      const match = result.cookies.find((c) => c.name === cookieName);
      if (match && match.value) {
        return match.value;
      }
    } catch {
      // Page may have navigated or CDP session failed — retry
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return null;
}

export async function runManualLogin(sid: string): Promise<void> {
  saveAuth(sid);
  console.log("Cookie saved. Validating...");

  const valid = await validateStoredAuth();
  if (valid) {
    console.log("\n✅ Authenticated successfully!");
  } else {
    console.error(
      "\n⚠️  Cookie saved but validation failed. The cookie may be expired or invalid."
    );
  }
}

export async function validateStoredAuth(): Promise<boolean> {
  try {
    const headers = getCookieHeaders();
    const subdomain =
      process.env["SUBSTACK_SUBDOMAIN"] ||
      loadAuth()?.subdomain ||
      "substack";

    const res = await fetch(
      `https://${subdomain}.substack.com/api/v1/archive?limit=1`,
      { headers }
    );

    return res.ok;
  } catch {
    return false;
  }
}

export async function checkAuthStatus(): Promise<{
  authenticated: boolean;
  cookieAge?: string;
  subdomain?: string;
}> {
  const auth = loadAuth();
  if (!auth) {
    return { authenticated: false };
  }

  const valid = await validateStoredAuth();
  const extractedDate = new Date(auth.extractedAt);
  const ageMs = Date.now() - extractedDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const ageHours = Math.floor(
    (ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );

  return {
    authenticated: valid,
    cookieAge: `${ageDays}d ${ageHours}h (extracted ${auth.extractedAt})`,
    subdomain: auth.subdomain,
  };
}
