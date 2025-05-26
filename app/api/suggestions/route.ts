import { NextRequest, NextResponse } from "next/server";
import { WebflowClient } from "webflow-api";
import findSiteDetails from "../../lib/utils/find-site-details";

function withCORS(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("query");
    const siteName = searchParams.get("siteName");
    const collectionsParam = searchParams.get("collections");
    const searchFieldsParam = searchParams.get("searchFields");

    if (!rawQuery || !siteName) {
      return withCORS(
        NextResponse.json({ error: "Missing required query or siteName" }, { status: 400 })
      );
    }

    const query = rawQuery.toLowerCase().trim();
    let selectedCollections: string[] = [];
    if (collectionsParam) {
      try {
        selectedCollections = JSON.parse(collectionsParam);
      } catch {
        console.warn("Invalid collections param, ignoring");
      }
    }

    let searchFields: string[] = [];
    if (searchFieldsParam) {
      try {
        searchFields = JSON.parse(searchFieldsParam);
      } catch {
        console.warn("Invalid searchFields param, ignoring");
      }
    }

    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      return withCORS(
        NextResponse.json({ error: "Invalid siteName or site not found" }, { status: 404 })
      );
    }

    const { siteId, accessToken } = siteDetails;
    const client = new WebflowClient({ accessToken });
    const collectionsResult = await client.collections.list(siteId);
    if (!collectionsResult?.collections?.length) {
      return withCORS(
        NextResponse.json({ error: "No collections found" }, { status: 404 })
      );
    }

    const collectionsToSearch =
      selectedCollections.length > 0
        ? collectionsResult.collections.filter((c) => selectedCollections.includes(c.id))
        : collectionsResult.collections;

    const suggestionsSet = new Set<string>();

    for (const collection of collectionsToSearch) {
      const collectionId = collection.id;
      const itemsResult = await client.collections.items.listItems(collectionId);
      if (!itemsResult?.items?.length) continue;

      for (const item of itemsResult.items) {
        const fieldData = item.fieldData ?? item;

        const fieldsToCheck = searchFields.length > 0 ? searchFields : Object.keys(fieldData);

        for (const field of fieldsToCheck) {
          const value = fieldData[field];
          if (typeof value === "string" && value.toLowerCase().includes(query)) {
            // Extract first 3 words from the matched value
            const words = value.trim().split(/\s+/);
            const shortSuggestion = words.slice(0, 3).join(" ");
            suggestionsSet.add(shortSuggestion);

            if (suggestionsSet.size >= 10) break;
          }
        }
        if (suggestionsSet.size >= 10) break;
      }
      if (suggestionsSet.size >= 10) break;
    }

    return withCORS(
      NextResponse.json({
        suggestions: Array.from(suggestionsSet).slice(0, 10),
      })
    );
  } catch (error) {
    console.error("Error in suggestions endpoint:", error);
    return withCORS(
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
