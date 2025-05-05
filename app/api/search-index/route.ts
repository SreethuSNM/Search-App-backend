import { NextRequest, NextResponse } from "next/server";
import { WebflowClient } from "webflow-api";
import jwt from "../../lib/utils/jwt";

// CORS helper
function withCORS(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCORS(new NextResponse(null, { status: 204 }));
}

// Page indexing helpers
async function fetchAndStorePages(client: WebflowClient, siteId: string) {
  const result = await client.pages.list(siteId);
  const pages = result.pages ?? [];

  if (!Array.isArray(pages)) {
    throw new Error("Pages should be an array.");
  }

  const pageTitleMap: Record<string, { title: string; publishedPath: string }> = {};
  pages.forEach((page) => {
    const title = page.title || page.slug;
    const publishedPath = page.publishedPath || "";
    if (title) {
      pageTitleMap[page.id] = { title, publishedPath };
    }
  });

  return { pages, pageTitleMap };
}

// Type guard for text nodes
type WebflowTextNode = {
  text?: string | { text?: string };
};

function isTextNode(node: unknown): node is WebflowTextNode {
  if (typeof node === "object" && node !== null && "text" in node) {
    const typedNode = node as WebflowTextNode;
    const value = typedNode.text;
    return (
      typeof value === "string" ||
      (typeof value === "object" &&
        value !== null &&
        typeof value.text === "string")
    );
  }
  return false;
}

// Index a single page’s text content
async function indexPageText(
  client: WebflowClient,
  pageId: string,
  siteId: string,
  meta: { title: string; publishedPath: string }
) {
  const content = await client.pages.getContent(pageId, {});
  const rawNodes: unknown[] = content.nodes || [];

  const textContent = rawNodes
    .filter(isTextNode)
    .map((node) =>
      typeof node.text === "string"
        ? node.text.trim()
        : (node.text?.text || "").trim()
    )
    .filter(Boolean)
    .join("\n");

  return {
    pageId,
    title: meta.title,
    publishedPath: meta.publishedPath,
    text: textContent,
  };
}

// Search handler
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const accessToken = await jwt.verifyAuth(request);
    if (!accessToken) {
      return withCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.toLowerCase().trim();
    const siteId = searchParams.get("siteId");

    if (!query) {
      return withCORS(NextResponse.json({ error: "Search query is required" }, { status: 400 }));
    }

    if (!siteId) {
      return withCORS(NextResponse.json({ error: "siteId is required" }, { status: 400 }));
    }

    const client = new WebflowClient({ accessToken });

    // Fetch and index pages on every search request
    const { pages, pageTitleMap } = await fetchAndStorePages(client, siteId);

    const indexed = await Promise.all(
      pages.map(async (page) => {
        try {
          return await indexPageText(client, page.id, siteId, pageTitleMap[page.id]);
        } catch (err) {
          console.error(`Failed to index page ${page.id}`, err);
          return null;
        }
      })
    );

    // Filter out null entries and ensure correct type assertion
    const searchIndex = indexed.filter(Boolean) as typeof indexed;

    // Filter the results and ensure we access non-null entries
    const results = searchIndex
      .filter((entry) => entry !== null)  // Filter out null entries
      .map((entry) => ({
        pageId: entry!.pageId,  // Non-null assertion
        title: entry!.title,
        publishedPath: entry!.publishedPath,
        matchedText: entry!.text,
      }));

    return withCORS(NextResponse.json({ query, results }));
  } catch (error) {
    console.error("Search error:", error);
    return withCORS(
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
