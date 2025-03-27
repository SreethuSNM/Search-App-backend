// app/api/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Define interfaces
interface AnalyticsScript {
  src: string | null;
  content: string | null;
  type: string | null;
  async: boolean;
  defer: boolean;
}

interface AnalyticsResult {
  analyticsScripts: AnalyticsScript[];
  totalScripts: number;
  totalAnalyticsScripts: number;
}

// Helper function to add CORS headers
function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

// Handle preflight requests
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteUrl = searchParams.get('siteUrl');
    const siteId = searchParams.get('siteId');

    if (!siteUrl || !siteId) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing siteUrl or siteId" }, 
        { status: 400 }
      ));
    }

    // Get the Cloudflare KV binding
    const { env } = await getCloudflareContext({ async: true });
    
    // Retrieve the access token from KV storage with the correct key format
    const storedAuth = await env.WEBFLOW_AUTHENTICATION.get(`site-auth:${siteId}`);
    console.log("Stored auth data:", storedAuth);
    
    if (!storedAuth) {
      return withCORS(NextResponse.json(
        { success: false, error: "Unauthorized - No stored auth" }, 
        { status: 401 }
      ));
    }

    const authData = JSON.parse(storedAuth);
    console.log("Parsed auth data:", authData);

    if (!authData.accessToken) {
      return withCORS(NextResponse.json(
        { success: false, error: "Unauthorized - Invalid auth data" }, 
        { status: 401 }
      ));
    }

    // Fetch the site content
    const response = await fetch(siteUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch site content: ${response.statusText}`);
    }

    const html = await response.text();

    // Improved script extraction regex
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
    const srcRegex = /src=["']([^"']+)["']/;
    const typeRegex = /type=["']([^"']+)["']/;
    const asyncRegex = /async/;
    const deferRegex = /defer/;

    const scripts: AnalyticsScript[] = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      const attributes = match[1];
      const content = match[2];
      
      const srcMatch = attributes.match(srcRegex);
      const typeMatch = attributes.match(typeRegex);
      const async = asyncRegex.test(attributes);
      const defer = deferRegex.test(attributes);

      // Only add if it's an analytics script
      const isAnalytics = (
        // Check src
        (srcMatch && (
          srcMatch[1].includes('google-analytics') ||
          srcMatch[1].includes('googletagmanager') ||
          srcMatch[1].includes('gtag') ||
          srcMatch[1].includes('hotjar') ||
          srcMatch[1].includes('facebook') ||
          srcMatch[1].includes('fbq')
        )) ||
        // Check content
        (content && (
          content.includes('hotjar') ||
          content.includes('fbq') ||
          content.includes('dataLayer') ||
          content.includes('gtag') ||
          content.includes('googletagmanager')
        ))
      );

      if (isAnalytics) {
        scripts.push({
          src: srcMatch ? srcMatch[1] : null,
          content: content.trim() || null,
          type: typeMatch ? typeMatch[1] : null,
          async,
          defer
        });
      }
    }

    // Log the results for debugging
    console.log('Found analytics scripts:', scripts.length);
    scripts.forEach(script => {
      console.log('Script:', {
        src: script.src,
        type: script.type,
        async: script.async,
        defer: script.defer,
        contentLength: script.content?.length
      });
    });

    const result: AnalyticsResult = {
      analyticsScripts: scripts,
      totalScripts: scripts.length,
      totalAnalyticsScripts: scripts.length
    };

    return withCORS(NextResponse.json({ 
      success: true,
      data: result
    }));

  } catch (error: unknown) {
    console.error("Error fetching analytics scripts:", error);
    return withCORS(NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch analytics scripts" 
      },
      { status: 500 }
    ));
  }
}