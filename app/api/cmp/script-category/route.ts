import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyToken } from '@/app/lib/utils/visitor-token-verifiy';
import findSiteDetails from '@/app/lib/utils/find-site-details';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://consentbits-stellar-site.webflow.io',
  'https://*.webflow.io',
  'http://localhost:3000'
];

/**
 * Add CORS headers to the response.
 */
function withCORS(response: NextResponse, origin: string | null) {
  const headers = new Headers(response.headers);
  
  // Determine allowed origin
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    allowed.includes('*') ? origin.endsWith(allowed.replace('*', '')) : allowed === origin
  ) ? origin : ALLOWED_ORIGINS[0];

  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token, X-Request-ID");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Helper to create a CORS-enabled error response.
 */
function errorResponse(message: string, status: number, origin: string | null) {
  return withCORS(
    new NextResponse(JSON.stringify({ error: message }), { status }),
    origin
  );
}

/**
 * Handle preflight OPTIONS request.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    allowed.includes('*') ? origin.endsWith(allowed.replace('*', '')) : allowed === origin
  ) ? origin : ALLOWED_ORIGINS[0];

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token, X-Request-ID",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    },
  });
}
interface RequestBodyType {
  siteName : string;
  visitorId :string;
  userAgent : string;
}
/**
 * GET: Retrieve script categories from KV after token verification.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401, origin);
    }
  
    const token = authHeader.split(" ")[1];
    
    // Get data from request body
    const body = await request.json();
    const { siteName, visitorId } = body as RequestBodyType;
    console.log("SITE NAME :",siteName);
    
    if (!siteName) {
      return errorResponse("Site name is required", 400, origin);
    }
    
    try {
      const { isValid, error } = await verifyToken(token, siteName);
      if (!isValid) {
        return errorResponse(error || "Invalid token or site name", 401, origin);
      }
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);
      return errorResponse("Token verification failed", 401, origin);
    }
    
    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      return errorResponse("Site details not found", 404, origin);
    }
    
    const context = await getCloudflareContext();
    if (!context?.env?.WEBFLOW_AUTHENTICATION) {
      console.error("KV binding missing or misconfigured");
      return errorResponse("Internal server error: KV binding missing", 500, origin);
    }
    
    const kvKey = `script-categories:${siteDetails.siteId}`;
    const value = await context.env.WEBFLOW_AUTHENTICATION.get(kvKey);
    
    if (!value) {
      return withCORS(
        new NextResponse(JSON.stringify({
          scripts: [],
          message: "No script categories found for this site"
        }), { status: 200 }),
        origin
      );
    }
    
    try {
      const scriptData = JSON.parse(value);
      return withCORS(
        new NextResponse(JSON.stringify({ 
          scripts: scriptData,
          visitorId: visitorId 
        }), { status: 200 }),
        origin
      );
    } catch (parseError) {
      console.error("Failed to parse script data:", parseError, value);
      return withCORS(
        new NextResponse(JSON.stringify({
          scripts: [],
          message: "Error parsing script categories"
        }), { status: 500 }),
        origin
      );
    }
  } catch (err) {
    console.error("Unexpected error in POST handler:", err);
    return errorResponse("Internal server error", 500, origin);
  }
}