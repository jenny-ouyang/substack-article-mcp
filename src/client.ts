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

function getBaseUrl(): string {
  const subdomain =
    process.env["SUBSTACK_SUBDOMAIN"] || loadAuth()?.subdomain;
  if (!subdomain) {
    throw new Error(
      "Not configured. Run `substack-article-mcp login` to connect your Substack account."
    );
  }
  return `https://${subdomain}.substack.com`;
}

async function apiGet(endpoint: string): Promise<unknown> {
  const url = `${getBaseUrl()}${endpoint}`;
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
}): Promise<SubstackArticle[]> {
  const { limit = 12, offset = 0, sort = "new", search = "" } = options;

  const params = new URLSearchParams({
    sort,
    search,
    offset: String(offset),
    limit: String(limit),
  });

  const data = (await apiGet(`/api/v1/archive?${params}`)) as Record<
    string,
    unknown
  >[];

  return data.map(normalizePost);
}

export async function getArticle(
  slugOrId: string
): Promise<SubstackArticleFull> {
  const raw = (await apiGet(`/api/v1/posts/${slugOrId}`)) as Record<
    string,
    unknown
  >;

  return {
    ...normalizePost(raw),
    bodyHtml: (raw["body_html"] as string) || "",
    truncatedBodyText: raw["truncated_body_text"] as string | undefined,
  };
}

export async function searchArticles(
  query: string,
  limit: number = 12
): Promise<SubstackArticle[]> {
  return listArticles({ search: query, limit, sort: "new" });
}
