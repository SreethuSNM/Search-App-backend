import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import jwt from "../../lib/utils/jwt";

// Define interfaces
interface AnalyticsScript {
  fullTag: string;
  src: string | null;
  content: string | null;
  type: string | null;
  async: boolean;
  defer: boolean;
  crossorigin: string | null;
  category: string;
}

interface AnalyticsResult {
  analyticsScripts: AnalyticsScript[];
  totalScripts: number;
  totalAnalyticsScripts: number;
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

export async function GET(request: NextRequest) {
  try {
    // Verify authentication and get site ID from token
    const accessToken = await jwt.verifyAuth(request);
    if (!accessToken) {
      return withCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
    const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
    if (!siteId) {
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: "SiteId not found"
      }, { status: 401 }));
    }

    const { env } = await getCloudflareContext({ async: true });
    const storedAuth = await env.WEBFLOW_AUTHENTICATION.get(siteId)
    if (!storedAuth) {
      return withCORS(NextResponse.json(
        { success: false, error: "Unauthorized - No stored auth" }, 
        { status: 401 }
      ));
    }
    const parsedData = JSON.parse(storedAuth)
    const siteUrl = `https://${parsedData.siteName}.webflow.io`

    if (!siteUrl || !siteId) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing siteUrl" }, 
        { status: 400 }
      ));
    }

    // Fetch the site content
    const response = await fetch(siteUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch site content: ${response.statusText}`);
    }

    const html = await response.text();

    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (!headMatch) {
      throw new Error('No head section found');
    }
    const headContent = headMatch[1];
    console.log("head content",headContent);

    // Define analytics script patterns with their categories
    const analyticsPatterns = [
      
      { pattern: /googletagmanager\.com/, category: 'google' },
      { pattern: /google-analytics\.com/, category: 'google' },
      { pattern: /googleadservices\.com/, category: 'google' },
      { pattern: /doubleclick\.net/, category: 'google' },
      { pattern: /google\.com\/ads/, category: 'google' },
      { pattern: /google\.com\/tagmanager/, category: 'google' },
      { pattern: /_gtag/, category: 'google' },
      
      
      { pattern: /hotjar\.com/, category: 'hotjar' },
    
      
      { pattern: /connect\.facebook\.net/, category: 'facebook' },
      { pattern: /fbevents\.js/, category: 'facebook' },
      { pattern: /graph\.facebook\.com/, category: 'facebook' },
      { pattern: /business\.facebook\.com/, category: 'facebook' },
      

      { pattern: /clarity\.ms/, category: 'microsoft' },
      { pattern: /mouseflow\.com/, category: 'mouseflow' },
      { pattern: /fullstory/, category: 'fullstory' },
      { pattern: /logrocket/, category: 'logrocket' },
      { pattern: /mixpanel/, category: 'mixpanel' },
      { pattern: /segment/, category: 'segment' },
      { pattern: /amplitude/, category: 'amplitude' },
      { pattern: /heap/, category: 'heap' },
      { pattern: /kissmetrics/, category: 'kissmetrics' },
      { pattern: /matomo/, category: 'matomo' },
      { pattern: /piwik/, category: 'piwik' },
      { pattern: /woopra/, category: 'woopra' },
      { pattern: /crazyegg/, category: 'crazyegg' },
      { pattern: /clicktale/, category: 'clicktale' },
      { pattern: /optimizely/, category: 'optimizely' },
      { pattern: /plausible/, category: 'plausible' },


    ];

    // Extract scripts from head section
    const scripts: AnalyticsScript[] = [];
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const srcRegex = /src=["']([^"']+)["']/i;

    let match;
    while ((match = scriptRegex.exec(headContent)) !== null) {
      const fullScript = match[0];
      const content = match[1]?.trim();
      const srcMatch = fullScript.match(srcRegex);
      const src = srcMatch ? srcMatch[1] : null;

      // Check if the script matches analytics patterns
      const matchingPattern = analyticsPatterns.find(({ pattern }) => {
        // Check both src and content for matches
        if (src && pattern.test(src)) return true;
        if (content && pattern.test(content)) return true;
        return false;
      });

      if (matchingPattern) {
        scripts.push({
          fullTag: fullScript,
          src: src,
          content: content,
          type: fullScript.match(/type=["']([^"']+)["']/i)?.[1] || null,
          async: fullScript.includes('async'),
          defer: fullScript.includes('defer'),
          crossorigin: fullScript.match(/crossorigin=["']([^"']+)["']/i)?.[1] || null,
          category: matchingPattern.category
        });
      }
    }

    // Log the results for debugging
    console.log('Found analytics scripts in header:', scripts.length);
    scripts.forEach(script => {
      console.log('Analytics Script:', {
        fullTag: script.fullTag,
        category: script.category,
        src: script.src,
        type: script.type,
        async: script.async,
        defer: script.defer
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