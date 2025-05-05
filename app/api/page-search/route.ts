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

export async function GET(request: NextRequest): Promise<NextResponse> {
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
    const result = await webflow.pages.list(siteId);

    const pages = result.pages; // Access pages array

    if (!pages || pages.length === 0) {
      return withCORS(NextResponse.json({ error: "No pages found" }, { status: 404 }));
    }

    return withCORS(NextResponse.json({ data: pages }));
  } catch (error: unknown) {
    console.error("Error fetching pages:", error);
    return withCORS(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
