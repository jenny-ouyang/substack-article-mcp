import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkAuthStatus } from "./auth.js";
import {
  listArticles,
  getArticle,
  searchArticles,
  getComments,
  type SubstackArticle,
  type SubstackComment,
} from "./client.js";
import { htmlToMarkdown } from "./html-to-md.js";

function formatArticleList(articles: SubstackArticle[]): string {
  if (articles.length === 0) return "No articles found.";

  return articles
    .map((a, i) => {
      const paid = a.audience === "only_paid" ? " [PAID]" : "";
      const section = a.section?.name ? ` (${a.section.name})` : "";
      const date = a.postDate
        ? new Date(a.postDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "";
      const stats = `${a.likes} likes, ${a.comments} comments`;

      return `${i + 1}. **${a.title}**${paid}${section}\n   ${date} | ${stats}\n   Slug: ${a.slug}\n   URL: ${a.canonicalUrl}`;
    })
    .join("\n\n");
}

const server = new McpServer({
  name: "substack-article-mcp",
  version: "0.1.0",
});

// ─── Tool: substack_auth_status ──────────────────────────────────

server.tool(
  "substack_auth_status",
  "Check if the Substack authentication is valid and show cookie age",
  {},
  async () => {
    const status = await checkAuthStatus();

    if (!status.authenticated) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Not authenticated. Run `substack-article-mcp login` in your terminal to connect your Substack account.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Authenticated ✓\nCookie age: ${status.cookieAge}\nSubdomain: ${status.subdomain || process.env["SUBSTACK_SUBDOMAIN"] || "(not set)"}`,
        },
      ],
    };
  }
);

// ─── Tool: list_articles ────────────────────────────────────────

server.tool(
  "list_articles",
  "List published Substack articles with metadata (title, date, slug, engagement stats, paid/free status). Returns newest first by default. Works with any Substack newsletter — defaults to your own, or specify a subdomain to read another.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of articles to return (default 12, max 50)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Pagination offset (default 0)"),
    sort: z
      .enum(["new", "top"])
      .optional()
      .describe("Sort order: 'new' (default) or 'top' by engagement"),
    subdomain: z
      .string()
      .optional()
      .describe("Substack subdomain to query (e.g. 'platformer', 'stratechery'). Defaults to your own newsletter."),
  },
  async ({ limit, offset, sort, subdomain }) => {
    try {
      const articles = await listArticles({
        limit: limit ?? 12,
        offset: offset ?? 0,
        sort: sort ?? "new",
        subdomain,
      });

      const total = articles.length;
      const text = `Found ${total} article${total === 1 ? "" : "s"}:\n\n${formatArticleList(articles)}`;

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ─── Tool: get_article ──────────────────────────────────────────

server.tool(
  "get_article",
  "Get full content of a Substack article as markdown. Requires the article slug (the URL path segment after /p/). Authenticated access includes premium/paywalled content if you're a subscriber.",
  {
    slug: z
      .string()
      .describe(
        "Article slug from the URL (the part after /p/ in the article URL, e.g. 'my-article-title')"
      ),
    subdomain: z
      .string()
      .optional()
      .describe("Substack subdomain (e.g. 'platformer'). Defaults to your own newsletter. Needed when reading someone else's articles."),
  },
  async ({ slug, subdomain }) => {
    try {
      const article = await getArticle(slug, subdomain);

      const paid = article.audience === "only_paid" ? " [PAID]" : "";
      const date = article.postDate
        ? new Date(article.postDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

      let markdown = "";
      markdown += `# ${article.title}${paid}\n\n`;
      if (article.subtitle) markdown += `*${article.subtitle}*\n\n`;
      if (date) markdown += `Published: ${date}\n`;
      markdown += `URL: ${article.canonicalUrl}\n`;
      markdown += `Engagement: ${article.likes} likes, ${article.comments} comments, ${article.restacks} restacks\n`;
      if (article.wordCount) markdown += `Word count: ${article.wordCount}\n`;
      markdown += "\n---\n\n";

      if (article.bodyHtml) {
        markdown += htmlToMarkdown(article.bodyHtml);
      } else if (article.truncatedBodyText) {
        markdown +=
          article.truncatedBodyText +
          "\n\n[Content truncated — you may not be subscribed to this newsletter's paid tier]";
      } else {
        markdown += "(No article content available)";
      }

      return { content: [{ type: "text" as const, text: markdown }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ─── Tool: search_articles ──────────────────────────────────────

server.tool(
  "search_articles",
  "Search Substack articles by keyword. Returns matching articles with metadata. Works with any newsletter — defaults to your own, or specify a subdomain.",
  {
    query: z.string().describe("Search query to find articles"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results to return (default 12)"),
    subdomain: z
      .string()
      .optional()
      .describe("Substack subdomain to search (e.g. 'platformer'). Defaults to your own newsletter."),
  },
  async ({ query, limit, subdomain }) => {
    try {
      const articles = await searchArticles(query, limit ?? 12, subdomain);
      const total = articles.length;

      if (total === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No articles found matching "${query}".`,
            },
          ],
        };
      }

      const text = `Found ${total} article${total === 1 ? "" : "s"} matching "${query}":\n\n${formatArticleList(articles)}`;
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ─── Tool: get_comments ──────────────────────────────────────────

function formatComment(c: SubstackComment, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const date = c.date
    ? new Date(c.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const reactions = Object.entries(c.reactions)
    .map(([emoji, count]) => `${emoji} ${count}`)
    .join(" ");
  const edited = c.editedAt ? " (edited)" : "";

  let line = `${indent}**${c.name}** — ${date}${edited}`;
  if (reactions) line += ` | ${reactions}`;
  line += `\n${indent}${c.body}`;

  const childLines = c.children.map((child) => formatComment(child, depth + 1));
  if (childLines.length > 0) {
    line += "\n" + childLines.join("\n\n");
  }
  return line;
}

server.tool(
  "get_comments",
  "Get all comments on a Substack article, including full text, author names, nested replies, and reaction counts. Returns the complete uncompressed comment tree.",
  {
    slug: z
      .string()
      .describe(
        "Article slug from the URL (e.g. 'my-article-title')"
      ),
    subdomain: z
      .string()
      .optional()
      .describe("Substack subdomain (e.g. 'platformer'). Defaults to your own newsletter."),
  },
  async ({ slug, subdomain }) => {
    try {
      const { comments } = await getComments(slug, subdomain);

      if (comments.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No comments on this article." }],
        };
      }

      const total = comments.reduce(
        function countAll(sum: number, c: SubstackComment): number {
          return c.children.reduce(countAll, sum + 1);
        },
        0
      );

      const formatted = comments.map((c) => formatComment(c)).join("\n\n---\n\n");
      const text = `${total} comment${total === 1 ? "" : "s"} (${comments.length} top-level):\n\n${formatted}`;

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ─── Start Server ────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Substack MCP server running on stdio");
}
