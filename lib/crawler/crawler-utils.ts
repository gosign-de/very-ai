import Crawler from "crawler";
import { JSDOM } from "jsdom";
import puppeteer from "puppeteer";
import { createLogger } from "@/lib/logger";

// Types
export type FileRecord = {
  id: string;
  user_id: string;
  description: string;
  file_path: string;
  name: string;
  size: number;
  tokens: number;
  type: string;
};

export type CrawledPage = {
  url: string;
  title: string;
  content: string;
  depth: number;
  crawlDate: string;
};

export type CrawlResult = {
  pages: CrawledPage[];
  metadata: {
    totalPages: number;
    totalPagesQueued: number;
    rootUrl: string;
  };
};

// Regular expressions for text cleaning
const newlineRegex = /(\r\n|\n)+/g;
const spacesRegex = /[ \t]+/g;

// Exported constants
export const URL_REGEX = /^https?:\/\/[^\s]+$/;
export const CRAWLER_MAX_PAGES = parseInt(
  process.env.CRAWLER_MAX_PAGES || "2",
  10,
);
export const CRAWLER_MAX_DEPTH = parseInt(
  process.env.CRAWLER_MAX_DEPTH || "1",
  10,
);

// Lazy Supabase client (shared across crawler routes)
import { getServiceClient } from "@/lib/supabase/service-client";
export const getSupabase = () => getServiceClient();

// Logger factory for crawler routes
const defaultLogger = createLogger({ feature: "crawler" });

/**
 * SSRF protection: checks whether a URL points to an internal/private network address.
 */
export function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

/**
 * Checks whether a URL likely requires JavaScript rendering by inspecting
 * the Content-Type header.
 */
export async function needsJavaScriptRendering(
  url: string,
  logger = defaultLogger,
): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("text/html");
  } catch (error) {
    logger.error("Error checking JS rendering", {
      url,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
}

/**
 * Scrapes a URL using headless Puppeteer, returning the page title, text
 * content, and discovered links.
 */
export async function scrapeWithPuppeteer(
  url: string,
  logger = defaultLogger,
): Promise<{ title: string; content: string; links: string[] }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    const [title, content, links] = await Promise.all([
      page.title(),
      page.evaluate(() => document.body.innerText),
      page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]")).map(a =>
          a.getAttribute("href"),
        ),
      ),
    ]);

    await browser.close();
    return { title, content, links: links.filter(l => l) };
  } catch (error) {
    logger.error("Puppeteer failed", {
      url,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    await browser.close();
    return { title: "", content: "", links: [] };
  }
}

/**
 * Normalizes whitespace in a string: collapses newlines and horizontal
 * whitespace, then trims.
 */
export function normalizeWhitespace(content: string | null): string {
  if (!content) return "";
  return content.replace(newlineRegex, "\n").replace(spacesRegex, " ").trim();
}

/**
 * Removes all elements of the given tag types from a DOM Document.
 */
export function removeNodesOfType(doc: Document, ...types: string[]): void {
  types.forEach(type => {
    const elements = doc.getElementsByTagName(type);
    while (elements.length > 0) {
      elements[0].parentNode?.removeChild(elements[0]);
    }
  });
}

/**
 * Extracts text (or raw HTML) and title from an HTML string using JSDOM.
 * When `extractTextOption` is true, scripts/styles/SVGs are stripped first.
 */
export function extractText(
  extractTextOption: boolean,
  content: string,
  logger = defaultLogger,
): { content: string; title: string } {
  try {
    const dom = new JSDOM(content);
    const doc = dom.window.document;

    if (extractTextOption) {
      // Remove unwanted elements before extraction
      removeNodesOfType(doc, "script", "style", "svg", "path");

      // Clean and extract text content
      const cleanText = (selector: string): string => {
        const element = doc.querySelector(selector);
        if (!element) return "";
        return normalizeWhitespace(element.textContent);
      };

      return {
        content: cleanText("body"),
        title: cleanText("title"),
      };
    } else {
      // Return raw HTML if extractTextOption is false
      return {
        content: doc.querySelector("body")?.innerHTML || "",
        title: normalizeWhitespace(doc.querySelector("title")?.textContent),
      };
    }
  } catch (error) {
    logger.error("Text extraction error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error("Failed to extract text from HTML");
  }
}

/**
 * Enhanced text extraction: tries static JSDOM extraction first, then falls
 * back to Puppeteer if the page appears to need JavaScript rendering.
 */
export async function extractEnhancedText(
  url: string,
  extractTextOption: boolean,
  html: string,
  logger = defaultLogger,
) {
  try {
    // First try static extraction
    const staticResult = extractText(extractTextOption, html, logger);
    if (staticResult.content && staticResult.title) return staticResult;

    // Fallback to Puppeteer if no content found
    if (await needsJavaScriptRendering(url, logger)) {
      const puppeteerResult = await scrapeWithPuppeteer(url, logger);
      return {
        content: normalizeWhitespace(puppeteerResult.content),
        title: normalizeWhitespace(puppeteerResult.title),
      };
    }
    return staticResult;
  } catch (error) {
    logger.error("Enhanced text extraction error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return { content: "", title: "" };
  }
}

/**
 * Crawls a website starting from `rootUri`, following links up to `maxDepth`
 * levels deep and collecting up to `maxPages` pages.
 */
export async function crawl(
  rootUri: string,
  maxPages: number = CRAWLER_MAX_PAGES,
  maxDepth: number = CRAWLER_MAX_DEPTH,
  extractTextOption: boolean,
  logger = defaultLogger,
): Promise<CrawlResult> {
  const pages: CrawledPage[] = [];
  const urlDepth = new Map<string, number>();
  let totalQueued = 0;

  return new Promise((resolve, _reject) => {
    const crawler = new Crawler({
      // Pre-request callback: do not process further if we've reached the limit.
      preRequest: (options, done) => {
        if (pages.length >= maxPages) {
          logger.info("Max page limit reached, skipping processing", {
            url: options.uri || options.url,
          });
          return done(); // silently skip processing
        }
        totalQueued++;
        done();
      },
      callback: async (error: any, res: any, done: (error?: Error) => void) => {
        if (error) {
          logger.error("Crawl error", {
            url: res?.options?.uri,
            error:
              error instanceof Error
                ? { message: error.message, name: error.name }
                : error,
          });
          done();
          return;
        }

        // Check page limit before processing this page.
        if (pages.length >= maxPages) {
          logger.info("Max page limit reached, skipping processing", {
            url: res.options.uri,
          });
          done();
          return;
        }

        try {
          const url = res.options.uri || res.options.url;
          const currentDepth = urlDepth.get(url) || 0;

          // Use enhanced extraction with fallback to Puppeteer if needed
          const { content, title } = await extractEnhancedText(
            url,
            extractTextOption,
            res.body.toString(),
            logger,
          );

          if (content && title) {
            pages.push({
              url,
              title,
              content,
              depth: currentDepth,
              crawlDate: new Date().toISOString(),
            });
          } else {
            logger.info("Skipping URL, no content extracted", { url });
          }

          // Process links from both static and dynamic content
          let links: string[] = [];
          if (res.$) {
            // Extract static links if available
            links = res
              .$("a[href]")
              .map((_: number, link: any) => res.$(link).attr("href"))
              .get();
          } else {
            // Otherwise, get links using Puppeteer
            const puppeteerResult = await scrapeWithPuppeteer(url, logger);
            links = puppeteerResult.links;
          }

          // Loop through each extracted link; only queue if under maxPages.
          links.forEach((link: string) => {
            if (link && pages.length < maxPages) {
              try {
                const absoluteUrl = new URL(link, url).href;
                if (
                  absoluteUrl.startsWith(rootUri) &&
                  !urlDepth.has(absoluteUrl)
                ) {
                  // Only queue links if we're within the allowed depth
                  if (currentDepth < maxDepth) {
                    urlDepth.set(absoluteUrl, currentDepth + 1);
                    crawler.queue(absoluteUrl);
                  } else {
                    logger.info("Skipping URL, exceeds max depth", {
                      url: absoluteUrl,
                      maxDepth,
                    });
                  }
                }
              } catch (e) {
                logger.error("Error processing link", {
                  link,
                  error:
                    e instanceof Error
                      ? { message: e.message, name: e.name }
                      : e,
                });
              }
            }
          });

          // Optional: if we've reached maxPages, do nothing further.
          if (pages.length >= maxPages) {
            logger.info(
              "Reached maximum page limit, stopping further processing",
            );
          }
        } catch (err) {
          logger.error("Error processing page", {
            error:
              err instanceof Error
                ? { message: err.message, name: err.name }
                : err,
          });
        }

        done();
      },
    });

    // Start by queuing the root URI (only if under the limit)
    if (pages.length < maxPages) {
      urlDepth.set(rootUri, 0);
      crawler.queue(rootUri);
    }

    crawler.on("drain", () =>
      resolve({
        pages,
        metadata: {
          totalPages: pages.length,
          totalPagesQueued: totalQueued,
          rootUrl: rootUri,
        },
      }),
    );
  });
}

/**
 * Updates a file record in Supabase by file ID.
 */
export async function updateFile(
  fileId: string,
  updates: Partial<FileRecord>,
  logger = defaultLogger,
) {
  const { error } = await getSupabase()
    .from("files")
    .update(updates)
    .eq("id", fileId);

  if (error) {
    logger.error("Error updating file record", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error("Error updating file metadata");
  }
}
