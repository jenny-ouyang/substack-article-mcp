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

  let subdomain = await detectSubdomainFromPage(page as unknown as PageLike);
  await browser.close();

  if (!subdomain) {
    subdomain = await detectSubdomainFromApi(sid);
  }
  if (!subdomain && process.stdin.isTTY) {
    subdomain = await promptSubdomain();
  }

  saveAuth(sid, subdomain ?? undefined);

  if (subdomain) {
    console.log(`Newsletter: ${subdomain}.substack.com`);
  }

  console.log("Validating...");
  const valid = await validateStoredAuth();

  if (valid) {
    console.log("\n✅ Authenticated successfully!");
    console.log(`   Saved to ${AUTH_FILE}`);
    if (subdomain) {
      console.log(`   Subdomain: ${subdomain} (no need to set SUBSTACK_SUBDOMAIN)`);
    }
    console.log("\nYou can now use the Substack Article MCP in Cursor, Claude Code, or Claude Desktop.");
    await offerToAddMcp();
  } else {
    console.error(
      "\n⚠️  Cookie was saved but validation failed. You may need to try again."
    );
  }
}

type PageLike = {
  url(): string | Promise<string>;
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
};

async function detectSubdomainFromPage(page: PageLike): Promise<string | null> {
  const urlsToTry = [
    () => Promise.resolve(page.url()),
    async () => {
      await page.goto("https://substack.com/home", { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 3000));
      return Promise.resolve(page.url());
    },
    async () => {
      await page.goto("https://substack.com/dashboard", { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 2500));
      return Promise.resolve(page.url());
    },
    async () => {
      await page.goto("https://substack.com/writer", { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 2000));
      return Promise.resolve(page.url());
    },
  ];

  for (const getUrl of urlsToTry) {
    try {
      const url = await getUrl();
      const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.substack\.com/);
      if (match) return match[1];
    } catch {
      // continue to next
    }
  }
  return null;
}

function getCookieHeadersForSid(sid: string): Record<string, string> {
  return {
    Cookie: `substack.sid=${sid}; substack.lli=1`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json",
  };
}

/** Try Substack session/dashboard APIs with the cookie to get publication subdomain. */
async function detectSubdomainFromApi(sid: string): Promise<string | null> {
  const headers = getCookieHeadersForSid(sid);
  const bases = [
    "https://substack.com/api/v1",
    "https://substack.com/api",
  ];
  const paths = ["/me", "/user", "/session", "/dashboard", "/user/me"];
  for (const base of bases) {
    for (const path of paths) {
      try {
        const res = await fetch(`${base}${path}`, { headers, redirect: "follow" });
        const finalUrl = res.url;
        const match = finalUrl.match(/https?:\/\/([a-zA-Z0-9-]+)\.substack\.com/);
        if (match) return match[1];
        const text = await res.text();
        const data = text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null;
        if (data && typeof data === "object") {
          const pubObj = data["publication"];
          const sub = (data["subdomain"] ?? data["publication_subdomain"] ?? data["slug"] ?? (pubObj && typeof pubObj === "object" && pubObj !== null ? (pubObj as Record<string, unknown>)["slug"] : undefined)) as string | undefined;
          if (typeof sub === "string" && /^[a-zA-Z0-9-]+$/.test(sub)) return sub;
          const pub = data["publication"] ?? data["default_publication"];
          if (pub && typeof pub === "object" && pub !== null) {
            const p = pub as Record<string, unknown>;
            const s = (p["subdomain"] ?? p["slug"]) as string | undefined;
            if (typeof s === "string" && /^[a-zA-Z0-9-]+$/.test(s)) return s;
          }
        }
      } catch {
        // skip
      }
    }
  }
  return null;
}

async function promptSubdomain(): Promise<string | null> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\nWe couldn't detect your newsletter. Enter your subdomain (e.g. buildtolaunch): ", (answer) => {
      rl.close();
      const sub = (answer || "").trim().toLowerCase().replace(/\.substack\.com$/i, "").replace(/^https?:\/\//, "");
      resolve(sub ? sub : null);
    });
  });
}

async function offerToAddMcp(): Promise<void> {
  if (!process.stdin.isTTY) return;

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("\nAdd MCP to Cursor now? (y/n): ", (a) => {
      rl.close();
      resolve((a || "").trim().toLowerCase());
    });
  });
  if (answer !== "y" && answer !== "yes") return;

  try {
    const { addToConfig } = await import("./setup.js");
    const { path, updated } = addToConfig("cursor");
    if (updated) {
      console.log(`   Added to ${path}`);
      console.log("   Restart Cursor to use the MCP.");
    } else {
      console.log(`   Already in ${path}`);
    }
  } catch (err) {
    console.error("   Could not add to Cursor:", err instanceof Error ? err.message : String(err));
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
      loadAuth()?.subdomain ||
      process.env["SUBSTACK_SUBDOMAIN"] ||
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
