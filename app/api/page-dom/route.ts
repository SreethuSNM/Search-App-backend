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
  
      const webflow = new WebflowClient({ accessToken });
  
      const { searchParams } = new URL(request.url);
      const pageId = searchParams.get("pageId");
  
      if (!pageId) {
        return withCORS(NextResponse.json({ error: "Page ID is required" }, { status: 400 }));
      }
  
      const pageContent = await webflow.pages.getContent(pageId, {});
  
      if (!pageContent) {
        return withCORS(NextResponse.json({ error: "No content found for the page" }, { status: 404 }));
      }
  
      return withCORS(NextResponse.json({ data: pageContent }));
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error fetching page content:", error.message);
      } else {
        console.error("Unknown error fetching page content:", error);
      }
      return withCORS(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
    }
  }
  