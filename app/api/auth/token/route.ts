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
  firstName:string;
  // Add other Webflow user properties as needed
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  
  try {
    const body = await request.json() as TokenRequestBody;
    const { siteId, idToken } = body;
    console.log("siteId", siteId);
    console.log("idToken", idToken);

    if (!siteId || !idToken) {
      return NextResponse.json(
        { error: "Missing siteId or idToken" }, 
        { status: 400, headers: corsHeaders }
      );
    }

    const accessTokenRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ siteId })
    });
    console.log("Requesting access token");
    
    const accessToken = await jwt.getAccessToken(accessTokenRequest as unknown as NextRequest);
    console.log("accessToken:", accessToken);
    
    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401, headers: corsHeaders }
      );
    }
    console.log("Requesting resolve token");
  
    const response = await fetch("https://api.webflow.com/beta/token/resolve", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ idToken }),
    });
    console.log("Requesting resolve token response", response);
  
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Webflow API error:", errorData);
      return NextResponse.json(
        { error: "Failed to verify user" }, 
        { status: 401, headers: corsHeaders }
      );
    }

    // Type the response data
    const userData = await response.json() as WebflowUserResponse;
    console.log("userdata", userData);

    if (!userData.id || !userData.email) {
      return NextResponse.json(
        { error: "Invalid user data received" }, 
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate a Session Token with properly typed user data
    const tokenPayload = await jwt.createSessionToken({
      id: userData.id,
      email: userData.email
    });
    
    // Store both user auth and site-specific auth
    await Promise.all([
      // Store user authentication
      env.WEBFLOW_AUTHENTICATION.put(
        `user-auth:${userData.id}`,
        JSON.stringify({ 
          accessToken, 
          userData: {
            id: userData.id,
            email: userData.email,
            firstName: userData.firstName
          }
        }),
        { expirationTtl: 86400 }
      ),
      // Store site-specific authentication
      env.WEBFLOW_AUTHENTICATION.put(
        `site-auth:${siteId}`,
        JSON.stringify({
          accessToken,
          siteName: "consentbits-stellar-site"
        }),
        { expirationTtl: 86400 }
      )
    ]);

    // Verify the storage
    const storedSiteAuth = await env.WEBFLOW_AUTHENTICATION.get(`site-auth:${siteId}`);
    console.log("Verified stored site auth:", storedSiteAuth);
  
    const responseToken = NextResponse.json({ 
      sessionToken: tokenPayload.sessionToken, 
      email: userData.email,
      firstName: userData.firstName,
      exp: tokenPayload.exp 
    }, { headers: corsHeaders });
    
    console.log("Response Token Data:", {
      sessionToken: tokenPayload.sessionToken,
      email: userData.email,
      firstName: userData.firstName,
      exp: tokenPayload.exp
    });
    
    return responseToken;
    
  } catch (e) {
    console.error("Error processing token request:", e);
    return NextResponse.json(
      { error: "Error processing authentication request" },
      { status: 500, headers: corsHeaders }
    );
  }
}