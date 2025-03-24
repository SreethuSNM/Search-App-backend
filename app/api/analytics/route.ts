import puppeteer from 'puppeteer';
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface ScriptData {
  src: string | null;
  content: string | null;
  type: string | null;
  async: boolean;
  defer: boolean;
}

export async function GET(request: NextRequest) {
  try {
    // Get the Cloudflare context, including our KV bindings.
    const { env } = await getCloudflareContext({ async: true });
    
    // Retrieve the access token from KV under the key "accessToken".
    const accessToken = await env.WEBFLOW_AUTHENTICATION.get("accessToken");
    
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get siteUrl from query parameters
    const searchParams = request.nextUrl.searchParams;
    const siteUrl = searchParams.get('siteUrl');

    if (!siteUrl) {
      return NextResponse.json(
        { error: "Missing or invalid siteUrl parameter" },
        { status: 400 }
      );
    }

    // Launch Puppeteer browser and scrape scripts
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      await page.goto(siteUrl, { waitUntil: 'networkidle2' });
      
      const scripts: ScriptData[] = await page.evaluate(() => {
        return Array.from(document.scripts).map(script => ({
          src: script.src || null,
          content: script.textContent || script.innerHTML || null,
          type: script.type || null,
          async: script.async,
          defer: script.defer
        }));
      });

      // Filter for analytics scripts
      const analyticsScripts = scripts.filter(script => {
        const src = script.src?.toLowerCase() || '';
        const content = script.content?.toLowerCase() || '';
        return (
          // Google Analytics
          src.includes('google-analytics') ||
          src.includes('googletagmanager') ||
          src.includes('gtag') ||
          content.includes('gtag') ||
          content.includes('datalayer') ||
          content.includes('google-analytics') ||
          // Facebook Pixel
          src.includes('facebook') ||
          src.includes('fbq') ||
          content.includes('fbq') ||
          content.includes('facebook') ||
          // Hotjar
          src.includes('hotjar') ||
          content.includes('hotjar') ||
          // Other common analytics
          src.includes('mixpanel') ||
          src.includes('segment') ||
          src.includes('amplitude') ||
          src.includes('heap') ||
          src.includes('intercom') ||
          src.includes('drift') ||
          src.includes('crisp') ||
          src.includes('zendesk')
        );
      });

      console.log('Found scripts:', scripts.length);
      console.log('Analytics scripts:', analyticsScripts.length);
      analyticsScripts.forEach(script => {
        console.log('Script:', {
          src: script.src,
          contentLength: script.content?.length,
          type: script.type
        });
      });

      return NextResponse.json({ analyticsScripts });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: "Failed to fetch analytics scripts" },
      { status: 500 }
    );
  }
}
