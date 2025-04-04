import { NextRequest, NextResponse } from "next/server";
import selectBannerTemplate from "../../../lib/services/BannerType"
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


export async function POST(request: NextRequest) {
  try {
    // Clone the request to safely parse JSON and log it
    const clonedRequest = request.clone();
    const body = (await clonedRequest.json());
    console.log("Detect Location Request body:", body);
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


 
    
    console.log('Request Headers:', [...request.headers]);
    const country = request.headers.get('CF-IPCountry') || 'UNKNOWN';
    const continent = request.headers.get('CF-IPContinent') || 'UNKNOWN';
    
    console.log('Detected location:', { country, continent });
    const currentBannerType = selectBannerTemplate(country);
     
    return withCORS(NextResponse.json({ bannerType:currentBannerType,coutry:country }, { status: 200 }));
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
