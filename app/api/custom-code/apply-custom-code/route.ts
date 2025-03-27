import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { WebflowClient } from "webflow-api";
import { ScriptController } from "@/app/lib/controllers/scriptControllers";

interface CustomCodeRequestBody {
  siteId: string;
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

// Handle API POST request
export async function POST(request: NextRequest) {
  try {
    // Clone the request to safely parse JSON
    const clonedRequest = request.clone();
    const body = (await clonedRequest.json()) as CustomCodeRequestBody;
    console.log("Request in apply-custom-code body:", body);
    const siteId = decodeURIComponent(body.siteId);

    // Get the Cloudflare KV binding
    const { env } = await getCloudflareContext({ async: true });
    
    // Retrieve the access token from KV storage with the correct key format
    const storedAuth = await env.WEBFLOW_AUTHENTICATION.get(`site-auth:${siteId}`);
    console.log("Stored auth data:", storedAuth);
    
    if (!storedAuth) {
      return withCORS(NextResponse.json({ error: "Unauthorized - No stored auth" }, { status: 401 }));
    }

    const authData = JSON.parse(storedAuth);
    console.log("Parsed auth data:", authData);

    if (!authData.accessToken) {
      return withCORS(NextResponse.json({ error: "Unauthorized - Invalid auth data" }, { status: 401 }));
    }

    // Create Webflow client and register script
    console.log("Creating Webflow client with access token...");
    const webflow = new WebflowClient({ 
      accessToken: authData.accessToken
    });
    
    console.log("Initializing Script Controller...");
    const scriptController = new ScriptController(webflow);
    console.log("Registering hosted scripts...");
    const result = await scriptController.registerHostedScripts(siteId);
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
