import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface CustomCodeRequestBody {
  targetType: string;
  targetId: string;
  scriptId: string;
  location: string;
  version: string;
}

export async function POST(request: NextRequest) {
  try {
    // Clone the request to safely parse JSON and log it
    const clonedRequest = request.clone();
    const body = (await clonedRequest.json()) as CustomCodeRequestBody;
    console.log("Request body:", body);

    // Get the Cloudflare KV binding
    const { env } = await getCloudflareContext({ async: true });
    
    // Retrieve the access token from KV (assumed stored under the key "accessToken")
    const accessToken = await env.WEBFLOW_AUTHENTICATION.get("accessToken");
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Destructure required fields from the request body
    const { targetType, targetId, scriptId, location, version } = body;
    console.log(targetType, targetId, scriptId, location, version, "body");

    // Validate that all required fields are present
    if (!targetType || !targetId || !scriptId || !location || !version) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build a KV key based on the target type.
    const kvKey = `${targetType}-custom-code:${targetId}:${scriptId}:${location}`;

    // Create a value object to store
    const valueObj = {
      accessToken,
      version,
      timestamp: Date.now(),
    };
    const value = JSON.stringify(valueObj);

    // Upsert the custom code in KV with an optional TTL (e.g., 24 hours = 86400 seconds)
    await env.WEBFLOW_AUTHENTICATION.put(kvKey, value, { expirationTtl: 86400 });

    // Return a success response, optionally including the KV key
    return NextResponse.json({ result: "Custom code upserted in KV", key: kvKey }, { status: 200 });
  } catch (error) {
    console.error(
      "Error applying custom code:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Failed to apply custom code" },
      { status: 500 }
    );
  }
}
