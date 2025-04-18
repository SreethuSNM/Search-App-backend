import { NextRequest, NextResponse } from "next/server";
import selectBannerTemplate from "../../../lib/services/BannerType";
import { verifyToken } from "@/app/lib/utils/visitor-token-verifiy";
import findSiteDetails from "@/app/lib/utils/find-site-details";

// // Allowed origins for CORS
// const ALLOWED_ORIGINS = [
//   'https://consentbits-stellar-site.webflow.io',
//   'https://*.webflow.io',
//   'http://localhost:3000'
// ];

/**
 * CORS helper function.
 */
function withCORS(response: NextResponse, ) {
  const headers = new Headers(response.headers);
  // const allowedOrigin =
  //   origin && ALLOWED_ORIGINS.some(allowed =>
  //     allowed.includes('*')
  //       ? origin.endsWith(allowed.replace('*', ''))
  //       : allowed === origin
  //   )
  //     ? origin
  //     : ALLOWED_ORIGINS[0];
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token");
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
function errorResponse(message: string, status: number) {
  return withCORS(
    new NextResponse(JSON.stringify({ error: message }), { status }),
  
  );
}

/**
 * Handle preflight OPTIONS request.
 */
export async function OPTIONS() {
  // const origin = request.headers.get("origin");
  // const allowedOrigin =
  //   origin && ALLOWED_ORIGINS.some(allowed =>
  //     allowed.includes('*')
  //       ? origin.endsWith(allowed.replace('*', ''))
  //       : allowed === origin
  //   )
  //     ? origin
  //     : ALLOWED_ORIGINS[0];
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    },
  });
}

/**
 * GET: Determine banner type based on location data.
 */
export async function GET(request: NextRequest) {
  // onst origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }
    
    const token = authHeader.split(" ")[1];
    
    // Extract siteName from URL query parameters
    const url = new URL(request.url);
    const siteName = url.searchParams.get('siteName');
    
    console.log("Extracted siteName from query params:", siteName); // Debug log
    
    if (!siteName) {
      return errorResponse("Site name is required", 400);
    }

    try {
      const { isValid, error } = await verifyToken(token, siteName);
      
      if (!isValid) {
        return errorResponse(error || "Invalid token", 401);
      }
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);
      return errorResponse("Token verification failed", 401);
    }
    
    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      console.error("Site not found for:", siteName); // Debug log
      return errorResponse("Site not found", 404);
    }
    
    // Log headers and extract location data from Cloudflare headers
    console.log("Request Headers:", [...request.headers]);
    const country = request.headers.get("CF-IPCountry") || "UNKNOWN";
    const continent = request.headers.get("CF-IPContinent") || "UNKNOWN";
    console.log("Detected location:", { country, continent });
    
    // Determine banner type based on country
    const currentBannerType = selectBannerTemplate(country);
    
    return withCORS(
      new NextResponse(JSON.stringify({ bannerType: currentBannerType ,country:country}), { status: 200 }),
      
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in GET handler:", message);
    return errorResponse("Internal server error", 500);
  }
}