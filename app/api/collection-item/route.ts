import { NextRequest, NextResponse } from "next/server";
import { WebflowClient } from "webflow-api";
import jwt from "../../lib/utils/jwt";

// CORS helper
function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = await jwt.verifyAuth(request);
    if (!accessToken) {
      return withCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get("collectionId");

    if (!collectionId) {
      return withCORS(NextResponse.json({ error: "Missing collectionId parameter" }, { status: 400 }));
    }

    const webflow = new WebflowClient({ accessToken });
    const result = await webflow.collections.items.listItems(collectionId);

    const items = result.items; // Access items array

    if (!items || items.length === 0) {
      return withCORS(NextResponse.json({ error: "No items found in collection" }, { status: 404 }));
    }

    return withCORS(NextResponse.json({ data: items }));
  } catch (error: unknown) {
    console.error("Error fetching collection items:", error);
    return withCORS(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
