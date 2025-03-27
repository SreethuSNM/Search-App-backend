import { NextRequest, NextResponse } from "next/server";
import { ScriptController } from "@/app/lib/controllers/scriptControllers";
import { WebflowClient } from "webflow-api";

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface CustomCodeRequestBody {
  targetType: string;
  targetId: string;
  scriptId: string;
  location: "header" | "footer"; // ✅ Restrict to valid values
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

    // Get the Cloudflare KV binding
    const { env } = await getCloudflareContext({ async: true });
    
    // Log the key we're looking for
    const authKey = `site-auth:${body.targetId}`;
    console.log("Looking for auth data with key:", authKey);
    
    const storedAuth = await env.WEBFLOW_AUTHENTICATION.get(authKey);
    console.log("Stored auth data:", storedAuth);

    if (!storedAuth) {
      console.error("No auth data found for key:", authKey);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized: No authentication found",
        details: `No auth data found for site ${body.targetId}`
      }, { status: 401 }));
    }
    
    const authData = JSON.parse(storedAuth);
    console.log("Parsed auth data:", authData);
    
    const accessToken = authData?.accessToken;
    if (!accessToken) {
      console.log("@@@@@@@@@@------No Access token")
      console.error("No access token in auth data:", authData);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: "No access token found in stored auth data"
      }, { status: 401 }));
    }

    // Destructure required fields from the request body
    const { targetType, targetId, scriptId, location, version } = body;
    console.log(targetType, targetId, scriptId, location, version, "body");

    // Validate that all required fields are present
    if (!targetType || !targetId || !scriptId || !location || !version) {
      return withCORS(NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      ));
    }

    // Create Webflow Client
    const webflow = new WebflowClient({ accessToken });
    const scriptController = new ScriptController(webflow);

    // Apply Custom Code
    let result;

    if (targetType === "site") {
      // Upsert Custom Code to Site
      result = await scriptController.upsertSiteCustomCode(
        targetId,
        scriptId,
        location,
        version
      );
    } else if (targetType === "page") {
      // Upsert Custom Code to Page
      result = await scriptController.upsertPageCustomCode(
        targetId,
        scriptId,
        location,
        version
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
