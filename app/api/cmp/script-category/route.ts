import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import jwt from "../../../lib/utils/jwt";
import { SecurityUtils } from "../../../lib/utils/security";



function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
  SecurityUtils.addSecurityHeaders(response.headers);
  return response;
}

export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    // Verify request has required headers
    const requestId = request.headers.get('X-Request-ID');
    if (!requestId) {
      return withCORS(NextResponse.json(
        { error: 'Missing request ID' },
        { status: 400 }
      ));
    }

    // Verify authentication and get site ID from token
    const accessToken = await jwt.verifyAuth(request);
    if (!accessToken) {
      return withCORS(NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ));
    }

    const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
    if (!siteId) {
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: "SiteId not found"
      }, { status: 401 }));
    }

    // Get Cloudflare context
    const { env } = getCloudflareContext();
    if (!env) {
      return withCORS(NextResponse.json(
        { error: 'Cloudflare environment not available' },
        { status: 500 }
      ));
    }

    // Get the script categories for this site
    const kvKey = `script-categories:${siteId}`;
    const value = await env.WEBFLOW_AUTHENTICATION.get(kvKey);
    
    if (!value) {
      return withCORS(NextResponse.json({
        scripts: [],
        message: 'No script categories found for this site'
      }));
    }

    try {
      const scriptData = JSON.parse(value);
      
      // Use SecurityUtils to sanitize scripts
      const sanitizedScripts = SecurityUtils.sanitizeScripts(scriptData.scripts);

      return withCORS(NextResponse.json({
        scripts: sanitizedScripts,
        requestId,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error parsing script data:', error);
      return withCORS(NextResponse.json(
        { error: 'Error parsing script categories' },
        { status: 500 }
      ));
    }

  } catch (error) {
    console.error('Error fetching script categories:', error);
    return withCORS(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ));
  }
} 