import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTH_DIR = join(homedir(), ".substack-article-mcp");
const AUTH_FILE = join(AUTH_DIR, "auth.json");
const CHROME_PROFILE_DIR = join(AUTH_DIR, "chrome-profile");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

interface StoredAuth {
  substackSid: string;
  extractedAt: string;
  subdomain?: string;
  substackLli?: string;
}

export function getAuthDir(): string {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  return AUTH_DIR;
}

export function getAuthFilePath(): string {
  return AUTH_FILE;
}

/**
 * Parse a cookie string (env var or manual input) into sid and optional lli.
 * Accepts formats:
 *   "substack.sid=VALUE; substack.lli=VALUE"
 *   "s%3A..." (raw sid value)
 */
export function parseCookieInput(input: string): { sid: string; lli?: string } {
  const trimmed = input.trim();
  if (trimmed.includes("=") && (trimmed.includes(";") || trimmed.includes("substack."))) {
    const parts = trimmed.split(";").map((p) => p.trim());
    let sid = "";
    let lli: string | undefined;
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name === "substack.sid") sid = value;
      if (name === "substack.lli" && value.length > 10) lli = value;
    }
    if (sid) return lli ? { sid, lli } : { sid };
  }
  return { sid: trimmed };
}

/**
 * Load auth from env var first, then auth.json file.
 * Priority: SUBSTACK_COOKIE env var > auth.json
 */
export function loadAuth(): StoredAuth | null {
  const envCookie = process.env["SUBSTACK_COOKIE"];
  if (envCookie && envCookie.trim().length > 0) {
    const { sid, lli } = parseCookieInput(envCookie);
    if (sid && sid.length > 5) {
      return {
        substackSid: sid,
        extractedAt: new Date().toISOString(),
        subdomain: process.env["SUBSTACK_SUBDOMAIN"],
        ...(lli ? { substackLli: lli } : {}),
      };
    }
  }

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

export function saveAuth(
  sid: string,
  subdomain?: string,
  lli?: string
): void {
  getAuthDir();
  const data: StoredAuth = {
    substackSid: sid,
    extractedAt: new Date().toISOString(),
    subdomain,
    ...(lli ? { substackLli: lli } : {}),
  };
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Returns true if any auth source is available. */
export function isAuthenticated(): boolean {
  return loadAuth() !== null;
}

/**
 * Build cookie headers for Substack API requests.
 * Returns null if no auth is available (instead of throwing).
 */
export function getCookieHeaders(): Record<string, string> | null {
  const auth = loadAuth();
  if (!auth) return null;

  const lli =
    auth.substackLli && auth.substackLli.length > 10
      ? auth.substackLli
      : "1";
  return {
    Cookie: `substack.sid=${auth.substackSid}; substack.lli=${lli}`,
    "User-Agent": USER_AGENT,
  };
}

/** Auth guidance message tailored to the user's context. */
export function getAuthGuidance(): string {
  const terminalTip = ' Alternatively, run in terminal: npx -y substack-article-mcp login';
  if (process.env["SUBSTACK_COOKIE"] !== undefined) {
    return "Your Substack cookie has expired or is invalid. Update it in your Claude Desktop extension settings, or use the substack_login tool to re-authenticate." + terminalTip;
  }
  return "Not authenticated. Use the substack_login tool to open a Chrome window and log in — credentials are saved permanently." + terminalTip;
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
      '\nAlternative: run "substack-article-mcp login --manual" to paste your cookie directly.'
    );
    process.exit(1);
  }

  console.log("Opening a Chrome window for Substack login...");
  console.log("(This is a separate window — your main Chrome stays open and unaffected.)\n");

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

  try {
    const client = await page.createCDPSession();
    const existing = (await client.send("Network.getAllCookies")) as {
      cookies: Array<{ name: string; value: string; domain: string }>;
    };
    for (const c of existing.cookies) {
      if (c.name === "substack.sid" || c.name === "substack.lli") {
        await (client as unknown as { send(method: string, params: unknown): Promise<void> })
          .send("Network.deleteCookies", { name: c.name, domain: c.domain });
      }
    }
    await client.detach();
  } catch {
    // Non-critical
  }

  await page.goto("https://substack.com/sign-in", {
    waitUntil: "networkidle2",
  });

  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│  A Chrome window just opened.                   │");
  console.log("│                                                  │");
  console.log("│  1. Enter your email and password to log in.    │");
  console.log("│  2. The window closes automatically when done.  │");
  console.log("│                                                  │");
  console.log("│  Waiting for you to finish logging in...        │");
  console.log("└─────────────────────────────────────────────────┘\n");

  const cookies = await waitForSubstackCookies(page, 300_000);

  if (!cookies) {
    console.error("Timed out waiting for login (5 minutes). Please try again.");
    await browser.close();
    process.exit(1);
  }

  console.log("Login detected! Extracting account info...");

  let subdomain = await detectSubdomainFromPage(page as unknown as PageLike);
  await browser.close();

  if (!subdomain) {
    subdomain = await detectSubdomainFromApi(cookies.sid);
  }

  saveAuth(cookies.sid, subdomain ?? undefined, cookies.lli ?? undefined);

  console.log("\n✅ Authenticated successfully!");
  console.log(`   Saved to ${AUTH_FILE}`);
  if (cookies.lli) {
    console.log("   substack.lli captured (paid/subscriber content available)");
  }
  if (subdomain) {
    console.log(`   Default newsletter: ${subdomain}.substack.com`);
  } else {
    console.log("   No default newsletter detected — specify a subdomain when listing or reading articles.");
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
      // continue
    }
  }
  return null;
}

function getCookieHeadersForSid(sid: string): Record<string, string> {
  return {
    Cookie: `substack.sid=${sid}; substack.lli=1`,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
}

async function detectSubdomainFromApi(sid: string): Promise<string | null> {
  const headers = getCookieHeadersForSid(sid);
  const bases = ["https://substack.com/api/v1", "https://substack.com/api"];
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

async function waitForSubstackCookies(
  page: {
    createCDPSession(): Promise<{ send(method: string): Promise<unknown>; detach(): Promise<void> }>;
    url(): string | Promise<string>;
  },
  timeoutMs: number
): Promise<{ sid: string; lli: string | null } | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const client = await page.createCDPSession();
      const result = (await client.send("Network.getAllCookies")) as {
        cookies: Array<{ name: string; value: string }>;
      };
      await client.detach();

      const sid = result.cookies.find((c) => c.name === "substack.sid")?.value;
      const lli = result.cookies.find((c) => c.name === "substack.lli")?.value ?? null;
      if (sid && sid.length > 0) {
        const url = await Promise.resolve(page.url());
        const stillOnSignIn = /sign-in/.test(url);
        if (!stillOnSignIn) {
          return { sid, lli: lli && lli.length > 10 ? lli : null };
        }
      }
    } catch {
      // retry
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return null;
}

export async function runManualLogin(cookieArg: string): Promise<void> {
  const { sid, lli } = parseCookieInput(cookieArg);
  if (!sid) {
    console.error("Could not find substack.sid in the provided cookie.");
    process.exit(1);
  }
  saveAuth(sid, undefined, lli);
  console.log("Cookie saved. Validating...");
  if (lli) console.log("(substack.lli captured — paid article content will be available)");

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
    if (!headers) return false;
    const res = await fetch(
      "https://substack.com/api/v1/reader/posts?limit=1",
      { headers, redirect: "follow" }
    );
    if (res.ok) return true;
    const subdomain = loadAuth()?.subdomain || process.env["SUBSTACK_SUBDOMAIN"];
    if (subdomain) {
      const res2 = await fetch(
        `https://${subdomain}.substack.com/api/v1/archive?limit=1`,
        { headers }
      );
      return res2.ok;
    }
    return false;
  } catch {
    return false;
  }
}

export async function checkAuthStatus(): Promise<{
  authenticated: boolean;
  authSource?: string;
  cookieAge?: string;
  subdomain?: string;
}> {
  const envCookie = process.env["SUBSTACK_COOKIE"];
  const hasEnvVar = envCookie !== undefined && envCookie.trim().length > 0;

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
    authSource: hasEnvVar ? "environment variable" : "auth.json",
    cookieAge: hasEnvVar ? "from env var" : `${ageDays}d ${ageHours}h (extracted ${auth.extractedAt})`,
    subdomain: auth.subdomain,
  };
}
