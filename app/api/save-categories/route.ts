// app/api/analytics/save-categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import withCORS from "@/app/lib/utils/cors";
import jwt from "../../lib/utils/jwt"
interface ScriptCategory {
  src: string | null;
  content: string | null;
  selectedCategories: string[];
}





interface SaveCategoriesRequest {

  scripts: ScriptCategory[];
}
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}


export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const body = await request.json() as SaveCategoriesRequest;
    const { scripts } = body;

    if (!scripts) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing Scripts" },
        { status: 400 }
      ));
    }

     // Verify site authentication using the session token
     const accessToken = await jwt.verifyAuth(request);
    
     if (!accessToken) {
       console.error("Authentication failed:", accessToken);
       return withCORS(NextResponse.json({ 
         error: "Unauthorized",
         details: accessToken || "Authentication failed"
       }, { status: 401 }));
     }
 
     const siteId = await jwt.getSiteIdFromAccessToken(accessToken) ;
     if (!siteId) {
       console.error("SiteId not found:", siteId);
       return withCORS(NextResponse.json({ 
         error: "Unauthorized",
         details: siteId || "SiteId failed"
       }, { status: 401 }));
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