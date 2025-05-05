import { NextRequest, NextResponse } from "next/server";
import { WebflowClient } from "webflow-api";
import { ScriptController } from "@/app/lib/controllers/scriptControllers";
import jwt from "../../../lib/utils/jwt";



// Helper function to add CORS headers
function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}
// Handle preflight requests
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

// Handle API POST request
export async function POST(request: NextRequest) {
  try {
   // Verify site authentication using the session token
   console.log("Requesting access token for apply-custom-code");
   const accessToken = await jwt.verifyAuth(request);
    
   if (!accessToken) {
     console.log("Authentication failed:", accessToken);
     return withCORS(NextResponse.json({ 
       error: "Unauthorized",
       details: accessToken || "Authentication failed"
     }, { status: 401 }));
   }
   console.log("Requesting site-id for apply-custom-code");

   const siteId = await jwt.getSiteIdFromAccessToken(accessToken) ;
    if (!siteId) {
      console.log("SiteId not found:", siteId);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: siteId || "SiteId failed"
      }, { status: 401 }));
    }

    // Create Webflow client and register script
    console.log("Creating Webflow client with access token...");
    const webflow = new WebflowClient({ 
      accessToken: accessToken
    });
    
    console.log("Initializing Script Controller...");
    const scriptController = new ScriptController(webflow);
    console.log("Registering hosted scripts...");
    const result = await scriptController.registerInlineScript(siteId);
    console.log("Script registration result:", result);

    return withCORS(NextResponse.json({ result }, { status: 200 }));

  } catch (error) {
    console.error("Error registering custom code:", error instanceof Error ? error.message : error);
    return withCORS(NextResponse.json({ 
      error: "Failed to register custom code",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 }));
  }
}