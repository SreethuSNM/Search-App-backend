// app/api/analytics/save-categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface ScriptCategory {
  src: string | null;
  content: string | null;
  selectedCategories: string[];
}

interface SaveCategoriesRequest {
  siteId: string;
  scripts: ScriptCategory[];
}

// Helper function to add CORS headers
function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const body = await request.json() as SaveCategoriesRequest;
    const { siteId, scripts } = body;

    if (!siteId || !scripts) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      ));
    }

    // Store the script categories in Cloudflare KV
    await env.WEBFLOW_AUTHENTICATION.put(
      `script-categories:${siteId}`,
      JSON.stringify(scripts),
      { expirationTtl: 86400 * 30 } // 30 days expiration
    );

    return withCORS(NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Error saving script categories:", error);
    return withCORS(NextResponse.json(
      { success: false, error: "Failed to save script categories" },
      { status: 500 }
    ));
  }
}