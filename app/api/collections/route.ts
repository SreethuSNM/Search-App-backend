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
    const siteId = searchParams.get("siteId");

    if (!siteId) {
      return withCORS(NextResponse.json({ error: "Missing siteId parameter" }, { status: 400 }));
    }

    const webflow = new WebflowClient({ accessToken });
    const result = await webflow.collections.list(siteId);

    const collections = result.collections; // Access collections array

    if (!collections || collections.length === 0) {
      return withCORS(NextResponse.json({ error: "No collections found" }, { status: 404 }));
    }

    return withCORS(NextResponse.json({ data: collections }));
  } catch (error: unknown) {
    console.error("Error fetching collections:", error);
    return withCORS(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
