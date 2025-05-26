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
interface FieldData {
  [key: string]: string | number | boolean | null;
}
function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("query");
    const siteName = searchParams.get("siteName");
    const selectedCollectionsParam = searchParams.get("collections");
    const searchFieldsParam = searchParams.get("searchFields");
    const displayFieldsParam = searchParams.get("displayFields");
    if (!rawQuery) {
      return withCORS(NextResponse.json({ error: "Search query is required" }, { status: 400 }));
    }
    if (!siteName) {
      return withCORS(NextResponse.json({ error: "siteName is required" }, { status: 400 }));
    }
    const query = rawQuery.toLowerCase().trim();
    let selectedCollections: string[] = [];
    if (selectedCollectionsParam) {
      try {
        selectedCollections = JSON.parse(selectedCollectionsParam);
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
    let displayFields: string[] = [];
    if (displayFieldsParam) {
      try {
        displayFields = JSON.parse(displayFieldsParam);
      } catch {
        console.warn("Invalid displayFields param, ignoring");
      }
    }
if (displayFields.length > 0 && !displayFields.includes("name")) {
  displayFields.push("name");
}
    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      return withCORS(
        NextResponse.json({ error: "Invalid site name or no site details found" }, { status: 404 })
      );
    }
    const { siteId, accessToken } = siteDetails;
    const client = new WebflowClient({ accessToken });
    const collectionsResult = await client.collections.list(siteId);
    if (!collectionsResult?.collections?.length) {
      return withCORS(NextResponse.json({ error: "No collections found" }, { status: 404 }));
    }
    const collectionsToSearch =
      selectedCollections.length > 0
        ? collectionsResult.collections.filter((c) => selectedCollections.includes(c.id))
        : collectionsResult.collections;
    const matches: FieldData[] = [];
    for (const collection of collectionsToSearch) {
      const collectionId = collection.id;
      const itemsResult = await client.collections.items.listItems(collectionId);
      if (!itemsResult?.items?.length) continue;
      for (const item of itemsResult.items) {
        const fieldData = item.fieldData ?? item;
        const matchFound = searchFields.length > 0
          ? searchFields.some(field => {
              const val = fieldData[field];
              return typeof val === "string" && val.toLowerCase().includes(query);
            })
          : Object.values(fieldData).some(val =>
              String(val).toLowerCase().includes(query)
            );
        if (matchFound) {
          const resultItem: FieldData = {};
          // const displayEntries = displayFields.length > 0
          //   ? Object.entries(fieldData).filter(([key]) => displayFields.includes(key))
          //   : Object.entries(fieldData);
          const displayEntries =
  displayFields.length > 0
    ? displayFields.map((key) => [key, fieldData[key]]).filter(([, value]) => value !== undefined)
    : Object.entries(fieldData);
          for (const [key, value] of displayEntries) {
            resultItem[key] =
              typeof value === "string" ? highlightMatch(value, query) : value;
          }
const origin = request.headers.get("origin") || `https://${siteName}.webflow.io`;

           // 👇 Build detailUrl
    const slug = fieldData.slug;
    const collectionName = collection.slug; // Recommended

  if (slug && collectionName) {
  const url = `${origin}/${collectionName}/${slug}`;
  resultItem["detailUrl"] = url;

}

          matches.push(resultItem);
        }
      } 
    }
    return withCORS(
      NextResponse.json({
        type: "search-cms",
        siteId,
        query,
        results: matches,
      })
    );
  } catch (error) {
    console.error("Error in CMS search endpoint:", error);
    return withCORS(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}