import { NextRequest, NextResponse } from "next/server";
import { ScriptController } from "@/app/lib/controllers/scriptControllers";
import { WebflowClient } from "webflow-api";
import jwt from "../../../lib/utils/jwt";
interface CustomCodeRequestBody {
  targetType: string; 
  scriptId: string;
  location: "header" | "footer";
  version: string;
}

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

export async function POST(request: NextRequest) {
  try {
    // Clone the request to safely parse JSON and log it
    const clonedRequest = request.clone();
    const body = (await clonedRequest.json()) as CustomCodeRequestBody;
    console.log("Request body:", body);

    // Validate that all required fields are present
    if (!body.targetType ||  !body.scriptId || !body.location || !body.version) {
      return withCORS(NextResponse.json(
        { error: "Missing required fields" },
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

    // Create Webflow Client with the verified access token
    const webflow = new WebflowClient({ accessToken:accessToken });
    const scriptController = new ScriptController(webflow);
    const siteId = await jwt.getSiteIdFromAccessToken(accessToken) ;
    if (!siteId) {
      console.error("SiteId not found:", siteId);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: siteId || "SiteId failed"
      }, { status: 401 }));
    }
    // Apply Custom Code
    let result;

    if (body.targetType === "site") {
      // Upsert Custom Code to Site
      result = await scriptController.upsertSiteCustomCode(
        siteId,
        body.scriptId,
        body.location,
        body.version
      );
    } else if (body.targetType === "page") {
      // Upsert Custom Code to Page
      result = await scriptController.upsertPageCustomCode(
        siteId,
        body.scriptId,
        body.location,
        body.version
      );
    } else {
      return withCORS(NextResponse.json(
        { error: "Invalid target type" },
        { status: 400 }
      ));
    }
  
    return withCORS(NextResponse.json({ result }, { status: 200 }));
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error applying custom code:", error.message);
      return withCORS(NextResponse.json({ 
        error: "Failed to apply custom code",
        details: error.message
      }, { status: 500 }));
    } else {
      console.error("Unknown error:", error);
      return withCORS(NextResponse.json({ 
        error: "Failed to apply custom code",
        details: "An unknown error occurred"
      }, { status: 500 }));
    }
  }
}