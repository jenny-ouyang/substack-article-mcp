import { load } from "cheerio";
import type { AnyNode, Element as DomElement, Text as DomText } from "domhandler";

export function htmlToMarkdown(html: string): string {
  const $ = load(html);

  $("script, style, .subscription-widget, .subscribe-widget, .paywall, .paywall-jump, .post-footer, .share-dialog, .button-wrapper, .captioned-button-wrap, .footer-wrap, .like-button-container").remove();

  function processNode(el: AnyNode): string {
    if (el.type === "text") {
      return (el as DomText).data || "";
    }

    if (el.type !== "tag") return "";

    const $el = $(el);
    const tag = (el as DomElement).tagName.toLowerCase();
    const children = $el.contents().toArray();
    const innerText = children.map(processNode).join("");

    switch (tag) {
      case "h1":
        return `\n# ${innerText.trim()}\n\n`;
      case "h2":
        return `\n## ${innerText.trim()}\n\n`;
      case "h3":
        return `\n### ${innerText.trim()}\n\n`;
      case "h4":
        return `\n#### ${innerText.trim()}\n\n`;
      case "h5":
      case "h6":
        return `\n##### ${innerText.trim()}\n\n`;
      case "p":
        return `\n${innerText.trim()}\n\n`;
      case "br":
        return "\n";
      case "hr":
        return "\n---\n\n";
      case "strong":
      case "b":
        return `**${innerText}**`;
      case "em":
      case "i":
        return `*${innerText}*`;
      case "code": {
        const parent = $el.parent();
        if (parent.length && parent[0] && (parent[0] as DomElement).tagName === "pre") {
          return innerText;
        }
        return `\`${innerText}\``;
      }
      case "pre": {
        const codeEl = $el.find("code");
        const content = codeEl.length ? codeEl.text() : innerText;
        return `\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
      }
      case "blockquote": {
        const lines = innerText.trim().split("\n");
        return "\n" + lines.map((l) => `> ${l}`).join("\n") + "\n\n";
      }
      case "a": {
        const href = $el.attr("href") || "";
        if (href && !href.startsWith("javascript:")) {
          return `[${innerText}](${href})`;
        }
        return innerText;
      }
      case "img": {
        const src = $el.attr("src") || ($el.data("src") as string) || "";
        const alt = $el.attr("alt") || "";
        if (src) return `\n![${alt}](${src})\n\n`;
        return "";
      }
      case "figure": {
        const img = $el.find("img");
        const caption = $el.find("figcaption");
        if (img.length) {
          const src = img.attr("src") || (img.data("src") as string) || "";
          const alt = img.attr("alt") || "";
          let result = `\n![${alt}](${src})\n`;
          if (caption.length) {
            result += `*${caption.text().trim()}*\n`;
          }
          return result + "\n";
        }
        return innerText;
      }
      case "ul":
      case "ol":
        return "\n" + innerText + "\n";
      case "li": {
        const parent = $el.parent();
        if (
          parent.length &&
          parent[0] &&
          (parent[0] as DomElement).tagName === "ol"
        ) {
          const idx = $el.index() + 1;
          return `${idx}. ${innerText.trim()}\n`;
        }
        return `- ${innerText.trim()}\n`;
      }
      case "video": {
        const src = $el.attr("src") || $el.find("source").first().attr("src") || "";
        if (src) return `\n[Video: ${src}]\n\n`;
        return "";
      }
      case "iframe": {
        const src = $el.attr("src") || "";
        if (src) return `\n[Embedded: ${src}]\n\n`;
        return "";
      }
      case "div":
      case "span":
      case "section":
      case "article":
      case "main":
        return innerText;
      default:
        return innerText;
    }
  }

  const body = $("body").contents().toArray();
  let md = body.map(processNode).join("");

  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}
