import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import jwt from "../../../lib/utils/jwt";

// Define interfaces
interface TokenRequestBody {
  siteId: string;
  idToken: string;
}

interface WebflowUserResponse {
  id: string;
  email: string;
  // Add other Webflow user properties as needed
}

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  
  try {
    const body = await request.json() as TokenRequestBody;
    const { siteId, idToken } = body;

    if (!siteId || !idToken) {
      return NextResponse.json({ error: "Missing siteId or idToken" }, { status: 400 });
    }

    const accessTokenRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ siteId })
    });
    
    const accessToken = await jwt.getAccessToken(accessTokenRequest as unknown as NextRequest);
    
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  
    const response = await fetch("https://api.webflow.com/beta/token/resolve", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ idToken }),
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Webflow API error:", errorData);
      return NextResponse.json({ error: "Failed to verify user" }, { status: 401 });
    }

    // Type the response data
    const userData = await response.json() as WebflowUserResponse;
    
    if (!userData.id || !userData.email) {
      return NextResponse.json({ error: "Invalid user data received" }, { status: 400 });
    }

    // Generate a Session Token with properly typed user data
    const tokenPayload = await jwt.createSessionToken({
      id: userData.id,
      email: userData.email
    });
    
    // Store the User ID and Access Token in Workers KV
    await env.WEBFLOW_AUTHENTICATION.put(
      `user-auth:${userData.id}`,
      JSON.stringify({ 
        accessToken, 
        userData: {
          id: userData.id,
          email: userData.email
        }
      }),
      { expirationTtl: 86400 }
    );
  
    return NextResponse.json({ 
      sessionToken: tokenPayload.sessionToken, 
      exp: tokenPayload.exp 
    });
    
  } catch (e) {
    console.error("Error processing token request:", e);
    return NextResponse.json(
      { error: "Error processing authentication request" },
      { status: 500 }
    );
  }
}