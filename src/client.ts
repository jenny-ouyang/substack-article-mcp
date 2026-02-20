import { load } from "cheerio";
import { getCookieHeaders, loadAuth } from "./auth.js";

export interface SubstackArticle {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  publishedAt: string;
  canonicalUrl: string;
  audience: string; // "everyone" or "only_paid"
  section?: { name: string };
  wordCount?: number;
  postDate: string;
  likes: number;
  comments: number;
  restacks: number;
}

export interface SubstackArticleFull extends SubstackArticle {
  bodyHtml: string;
  truncatedBodyText?: string;
}

/**
 * Resolve which subdomain to use. Priority:
 * 1. Explicit subdomain passed per-request (e.g. "platformer" to read someone else's newsletter)
 * 2. SUBSTACK_SUBDOMAIN env var
 * 3. Subdomain stored during login (your own newsletter)
 */
function resolveBaseUrl(subdomain?: string): string {
  const resolved =
    subdomain ||
    process.env["SUBSTACK_SUBDOMAIN"] ||
    loadAuth()?.subdomain;
  if (!resolved) {
    throw new Error(
      "No subdomain specified. Either pass a subdomain parameter, or run `substack-article-mcp login` to set a default."
    );
  }
  return `https://${resolved}.substack.com`;
}

async function apiGet(endpoint: string, subdomain?: string): Promise<unknown> {
  const url = `${resolveBaseUrl(subdomain)}${endpoint}`;
  const headers = getCookieHeaders();

  const res = await fetch(url, {
    headers: {
      ...headers,
      Accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Authentication failed. Your cookie may have expired. Run `substack-article-mcp login` to re-authenticate."
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Substack API error ${res.status}: ${text}`);
  }

  return res.json();
}

/** Fetch article HTML page with auth and extract post body (fallback when API returns truncated paid content). */
async function fetchArticleBodyFromPage(slug: string, subdomain?: string): Promise<string> {
  const baseUrl = resolveBaseUrl(subdomain);
  const headers = getCookieHeaders();
  const res = await fetch(`${baseUrl}/p/${slug}`, {
    headers: {
      ...headers,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) return "";
  const html = await res.text();
  const $ = load(html);
  const selectors = [
    ".body.markup",
    "[data-testid='post-body']",
    ".post-body",
    ".body",
    ".entry-content",
    "article .body",
  ];
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const raw = el.html()?.trim();
      if (raw && raw.length > 500) return raw;
    }
  }
  return "";
}

function normalizePost(raw: Record<string, unknown>): SubstackArticle {
  return {
    id: raw["id"] as number,
    title: (raw["title"] as string) || "",
    slug: (raw["slug"] as string) || "",
    subtitle: (raw["subtitle"] as string) || "",
    description: (raw["description"] as string) || "",
    publishedAt: (raw["post_date"] as string) || "",
    canonicalUrl: (raw["canonical_url"] as string) || "",
    audience: (raw["audience"] as string) || "everyone",
    section: raw["publishedBylines"]
      ? undefined
      : ((raw["section"] as { name: string }) || undefined),
    wordCount: raw["wordcount"] as number | undefined,
    postDate: (raw["post_date"] as string) || "",
    likes: (raw["reaction_count"] as number) || 0,
    comments: (raw["comment_count"] as number) || 0,
    restacks: (raw["restacks"] as number) || 0,
  };
}

export async function listArticles(options: {
  limit?: number;
  offset?: number;
  sort?: "new" | "top";
  search?: string;
  subdomain?: string;
}): Promise<SubstackArticle[]> {
  const { limit = 12, offset = 0, sort = "new", search = "", subdomain } = options;

  const params = new URLSearchParams({
    sort,
    search,
    offset: String(offset),
    limit: String(limit),
  });

  const data = (await apiGet(`/api/v1/archive?${params}`, subdomain)) as Record<
    string,
    unknown
  >[];

  return data.map(normalizePost);
}

export async function getArticle(
  slugOrId: string,
  subdomain?: string
): Promise<SubstackArticleFull> {
  const raw = (await apiGet(`/api/v1/posts/${slugOrId}`, subdomain)) as Record<
    string,
    unknown
  >;

  let bodyHtml = (raw["body_html"] as string) || "";
  const truncatedBodyText = raw["truncated_body_text"] as string | undefined;
  const wordCount = raw["wordcount"] as number | undefined;
  const isPaid = (raw["audience"] as string) === "only_paid";
  const slug = (raw["slug"] as string) || slugOrId;

  const likelyTruncated =
    !bodyHtml ||
    (truncatedBodyText != null && truncatedBodyText.length > 0) ||
    (wordCount != null && wordCount > 200 && bodyHtml.length < wordCount * 5);
  if (isPaid && likelyTruncated) {
    const fromPage = await fetchArticleBodyFromPage(slug, subdomain);
    if (fromPage.length > bodyHtml.length) bodyHtml = fromPage;
  }

  return {
    ...normalizePost(raw),
    bodyHtml,
    truncatedBodyText,
  };
}

export async function searchArticles(
  query: string,
  limit: number = 12,
  subdomain?: string
): Promise<SubstackArticle[]> {
  return listArticles({ search: query, limit, sort: "new", subdomain });
}

// ─── Comments ───────────────────────────────────────────────────

export interface SubstackComment {
  id: number;
  body: string;
  name: string;
  date: string;
  editedAt?: string;
  reactions: Record<string, number>;
  children: SubstackComment[];
}

function normalizeComment(raw: Record<string, unknown>): SubstackComment {
  const childrenRaw = (raw["children"] ?? raw["childComments"] ?? []) as Record<string, unknown>[];
  return {
    id: raw["id"] as number,
    body: (raw["body"] as string) || "",
    name: (raw["name"] as string) || "Anonymous",
    date: (raw["date"] as string) || "",
    editedAt: raw["edited_at"] as string | undefined,
    reactions: (raw["reactions"] as Record<string, number>) || {},
    children: Array.isArray(childrenRaw) ? childrenRaw.map(normalizeComment) : [],
  };
}

/**
 * Fetch full comment tree for an article.
 * The slug is resolved to a post ID first via the article detail endpoint.
 */
export async function getComments(
  slugOrId: string,
  subdomain?: string
): Promise<{ postId: number; comments: SubstackComment[] }> {
  // Resolve slug → post ID
  const raw = (await apiGet(`/api/v1/posts/${slugOrId}`, subdomain)) as Record<string, unknown>;
  const postId = raw["id"] as number;
  if (!postId) throw new Error(`Could not resolve post ID for "${slugOrId}"`);

  const params = new URLSearchParams({
    all_comments: "true",
    sort: "best_first",
  });
  const data = (await apiGet(`/api/v1/post/${postId}/comments?${params}`, subdomain)) as Record<string, unknown>;
  const commentsRaw = (data["comments"] ?? []) as Record<string, unknown>[];

  return {
    postId,
    comments: commentsRaw.map(normalizeComment),
  };
}
