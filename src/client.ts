import { load } from "cheerio";
import { getCookieHeaders, getAuthGuidance, isAuthenticated, loadAuth } from "./auth.js";

export interface SubstackArticle {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  publishedAt: string;
  canonicalUrl: string;
  audience: string;
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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function resolveBaseUrl(subdomain?: string): string {
  const resolved =
    subdomain ||
    process.env["SUBSTACK_SUBDOMAIN"] ||
    loadAuth()?.subdomain;
  if (!resolved) {
    throw new Error(
      "No subdomain specified. You MUST pass a 'subdomain' parameter (e.g. subdomain: 'platformer' for platformer.substack.com). Extract the subdomain from the Substack URL the user provided."
    );
  }
  return `https://${resolved}.substack.com`;
}

/**
 * Make an authenticated (or unauthenticated) GET request to a Substack API endpoint.
 * Works without cookies for public content; includes cookies when available.
 */
async function apiGet(endpoint: string, subdomain?: string): Promise<unknown> {
  const url = `${resolveBaseUrl(subdomain)}${endpoint}`;
  const cookies = getCookieHeaders();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (cookies) {
    headers["Cookie"] = cookies["Cookie"];
  }

  const res = await fetch(url, { headers });

  if (res.status === 401 || res.status === 403) {
    if (!isAuthenticated()) {
      throw new Error(
        `This content requires authentication. ${getAuthGuidance()}`
      );
    }
    throw new Error(
      `Authentication failed (cookie may have expired). ${getAuthGuidance()}`
      );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Substack API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function fetchArticleBodyFromPage(slug: string, subdomain?: string): Promise<string> {
  const baseUrl = resolveBaseUrl(subdomain);
  const cookies = getCookieHeaders();

  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": USER_AGENT,
  };
  if (cookies) {
    headers["Cookie"] = cookies["Cookie"];
  }

  const res = await fetch(`${baseUrl}/p/${slug}`, { headers });
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

function isNumericId(slugOrId: string): boolean {
  return /^\d+$/.test(slugOrId);
}

async function fetchPostById(id: string): Promise<{ post: Record<string, unknown>; subdomain?: string }> {
  const cookies = getCookieHeaders();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (cookies) {
    headers["Cookie"] = cookies["Cookie"];
  }

  const res = await fetch(`https://substack.com/api/v1/posts/by-id/${id}`, { headers });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication failed. ${getAuthGuidance()}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Substack API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const post = json["post"] as Record<string, unknown>;
  const pub = json["publication"] as Record<string, unknown> | undefined;
  return { post, subdomain: pub?.["subdomain"] as string | undefined };
}

export async function getArticle(
  slugOrId: string,
  subdomain?: string
): Promise<SubstackArticleFull> {
  let raw: Record<string, unknown>;
  let resolvedSubdomain = subdomain;

  if (isNumericId(slugOrId)) {
    const result = await fetchPostById(slugOrId);
    raw = result.post;
    if (!resolvedSubdomain) resolvedSubdomain = result.subdomain;
  } else {
    raw = (await apiGet(`/api/v1/posts/${slugOrId}`, subdomain)) as Record<string, unknown>;
  }

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
    if (isAuthenticated()) {
      const fromPage = await fetchArticleBodyFromPage(slug, resolvedSubdomain);
      if (fromPage.length > bodyHtml.length) bodyHtml = fromPage;
    }
    if (!bodyHtml || bodyHtml.length < 200) {
      bodyHtml = (bodyHtml || "") +
        "\n\n<!-- PAID ARTICLE — content above may be truncated. " +
        "If the user is a paid subscriber, suggest running the substack_login tool to authenticate and access the full article. -->";
    }
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

export async function getComments(
  slugOrId: string,
  subdomain?: string
): Promise<{ postId: number; comments: SubstackComment[] }> {
  let postId: number;
  let resolvedSubdomain = subdomain;

  if (isNumericId(slugOrId)) {
    postId = Number(slugOrId);
    if (!resolvedSubdomain) {
      const result = await fetchPostById(slugOrId);
      resolvedSubdomain = result.subdomain;
    }
  } else {
    const raw = (await apiGet(`/api/v1/posts/${slugOrId}`, subdomain)) as Record<string, unknown>;
    postId = raw["id"] as number;
    if (!postId) throw new Error(`Could not resolve post ID for "${slugOrId}"`);
  }

  const params = new URLSearchParams({
    all_comments: "true",
    sort: "best_first",
  });
  const data = (await apiGet(`/api/v1/post/${postId}/comments?${params}`, resolvedSubdomain)) as Record<string, unknown>;
  const commentsRaw = (data["comments"] ?? []) as Record<string, unknown>[];

  return {
    postId,
    comments: commentsRaw.map(normalizeComment),
  };
}

// ─── Subscriptions ──────────────────────────────────────────────

export interface SubstackSubscription {
  publicationId: number;
  name: string;
  subdomain: string;
  url: string;
  authorName: string;
  plan: "paid" | "comp" | "free";
  isFavorite: boolean;
  createdAt: string;
}

export async function listSubscriptions(): Promise<SubstackSubscription[]> {
  if (!isAuthenticated()) {
    throw new Error(
      `Listing subscriptions requires authentication. ${getAuthGuidance()}`
    );
  }

  const cookies = getCookieHeaders()!;
  const headers = { ...cookies, Accept: "application/json" };
  const res = await fetch("https://substack.com/api/v1/subscriptions?limit=500", { headers });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication failed (cookie may have expired). ${getAuthGuidance()}`);
  }
  if (!res.ok) throw new Error(`Substack API error ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const subs = (json["subscriptions"] || []) as Record<string, unknown>[];
  const pubs = (json["publications"] || []) as Record<string, unknown>[];

  const pubMap = new Map<number, Record<string, unknown>>();
  for (const pub of pubs) {
    pubMap.set(pub["id"] as number, pub);
  }

  return subs
    .map((sub) => {
      const pubId = sub["publication_id"] as number;
      const pub = pubMap.get(pubId);
      if (!pub) return null;
      const hasPaid = !!(sub["first_payment_at"]);
      const isComp = (sub["type"] as string) === "comp";
      const plan: "paid" | "comp" | "free" = hasPaid ? "paid" : isComp ? "comp" : "free";

      return {
        publicationId: pubId,
        name: (pub["name"] as string) || "",
        subdomain: (pub["subdomain"] as string) || "",
        url: (pub["base_url"] as string) || `https://${pub["subdomain"]}.substack.com`,
        authorName: (pub["author_name"] as string) || "",
        plan,
        isFavorite: (sub["is_favorite"] as boolean) || false,
        createdAt: (sub["created_at"] as string) || "",
      };
    })
    .filter((s): s is SubstackSubscription => s !== null && s.subdomain !== "");
}

// ─── Inbox (chronological) ───────────────────────────────────────

export interface InboxItem {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  publishedAt: string;
  canonicalUrl: string;
  audience: string;
  publicationName: string;
  publicationSubdomain: string;
  authorName: string;
  likes: number;
  comments: number;
  restacks: number;
  wordCount?: number;
}

export async function getInbox(pages: number = 1): Promise<InboxItem[]> {
  if (!isAuthenticated()) {
    throw new Error(
      `Accessing your inbox requires authentication. ${getAuthGuidance()}`
    );
  }

  const cookies = getCookieHeaders()!;
  const headers = { ...cookies, Accept: "application/json" };
  const allItems: InboxItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({
      inboxType: "inbox",
      surface: "inbox_all",
      limit: "20",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`https://substack.com/api/v1/inbox/top?${params}`, { headers });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication failed (cookie may have expired). ${getAuthGuidance()}`);
    }
    if (!res.ok) throw new Error(`Substack API error ${res.status}`);

    const json = (await res.json()) as Record<string, unknown>;
    const postItems = (json["post_items"] || json["posts"] || []) as Record<string, unknown>[];

    const pubMap = new Map<number, Record<string, unknown>>();
    const pubs = (json["publications"] || []) as Record<string, unknown>[];
    for (const pub of pubs) {
      pubMap.set(pub["id"] as number, pub);
    }

    for (const item of postItems) {
      const post = (item["post"] || item) as Record<string, unknown>;
      const pubId = post["publication_id"] as number;
      let pub = post["publishedBylines"]
        ? undefined
        : (post["publication"] as Record<string, unknown> | undefined);
      if (!pub) pub = pubMap.get(pubId);

      const bylines = (post["publishedBylines"] || []) as Record<string, unknown>[];

      allItems.push({
        id: post["id"] as number,
        title: (post["title"] as string) || "",
        slug: (post["slug"] as string) || "",
        subtitle: (post["subtitle"] as string) || "",
        publishedAt: (post["post_date"] as string) || "",
        canonicalUrl: (post["canonical_url"] as string) || "",
        audience: (post["audience"] as string) || "everyone",
        publicationName: (pub?.["name"] as string) || "",
        publicationSubdomain: (pub?.["subdomain"] as string) || "",
        authorName: (bylines[0]?.["name"] as string) || (pub?.["author_name"] as string) || "",
        likes: (post["reaction_count"] as number) || 0,
        comments: (post["comment_count"] as number) || 0,
        restacks: (post["restacks"] as number) || 0,
        wordCount: post["wordcount"] as number | undefined,
      });
    }

    const nextCursor = json["cursor"] as string | undefined;
    if (!nextCursor || postItems.length === 0) break;
    cursor = nextCursor;
  }

  allItems.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  return allItems;
}

// ─── Reader Feed ────────────────────────────────────────────────

export interface FeedItem {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  publishedAt: string;
  canonicalUrl: string;
  audience: string;
  publicationName: string;
  publicationSubdomain: string;
  authorName: string;
  likes: number;
  comments: number;
  restacks: number;
  wordCount?: number;
}

export async function getReaderFeed(limit: number = 20): Promise<FeedItem[]> {
  if (!isAuthenticated()) {
    throw new Error(
      `Accessing your reader feed requires authentication. ${getAuthGuidance()}`
    );
  }

  const apiLimit = Math.min(limit, 20);
  const cookies = getCookieHeaders()!;
  const headers = { ...cookies, Accept: "application/json" };
  const res = await fetch(`https://substack.com/api/v1/reader/posts?limit=${apiLimit}`, { headers });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication failed (cookie may have expired). ${getAuthGuidance()}`);
  }
  if (!res.ok) throw new Error(`Substack API error ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const posts = (json["posts"] || []) as Record<string, unknown>[];
  const pubs = (json["publications"] || []) as Record<string, unknown>[];

  const pubMap = new Map<number, Record<string, unknown>>();
  for (const pub of pubs) {
    pubMap.set(pub["id"] as number, pub);
  }

  const items = posts.map((post) => {
    const pubId = post["publication_id"] as number;
    const pub = pubMap.get(pubId);
    const bylines = (post["publishedBylines"] || []) as Record<string, unknown>[];

    return {
      id: post["id"] as number,
      title: (post["title"] as string) || "",
      slug: (post["slug"] as string) || "",
      subtitle: (post["subtitle"] as string) || "",
      publishedAt: (post["post_date"] as string) || "",
      canonicalUrl: (post["canonical_url"] as string) || "",
      audience: (post["audience"] as string) || "everyone",
      publicationName: (pub?.["name"] as string) || "",
      publicationSubdomain: (pub?.["subdomain"] as string) || "",
      authorName: (bylines[0]?.["name"] as string) || "",
      likes: (post["reaction_count"] as number) || 0,
      comments: (post["comment_count"] as number) || 0,
      restacks: (post["restacks"] as number) || 0,
      wordCount: post["wordcount"] as number | undefined,
    };
  });

  items.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  return items;
}
