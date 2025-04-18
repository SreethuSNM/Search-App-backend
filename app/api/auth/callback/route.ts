import { WebflowClient } from "webflow-api";
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: NextRequest) {
  // getCloudflareContext now returns an object where env is of type Cloudflare.Env
  const { env } = await getCloudflareContext({ async: true });
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    if (!env.WEBFLOW_AUTHENTICATION) {
      throw new Error("KV namespace 'WEBFLOW_AUTHENTICATION' is missing.");
    }

    // Exchange authorization code for access token
    const accessToken = await WebflowClient.getAccessToken({
      clientId: process.env.CLIENT_ID!,
      clientSecret: process.env.CLIENT_SECRET!,
      code: code,
    });

    // Initialize Webflow client with the access token
    const webflow = new WebflowClient({ accessToken });

    // Get user's Webflow sites
    const sites = await webflow.sites.list();
    const authInfo = await webflow.token.introspect();
    const siteList = sites?.sites ?? [];

    if (siteList.length === 0) {
      return NextResponse.json({ error: "No Webflow sites found." }, { status: 400 });
    }

    // Store Site ID & Access Token in Cloudflare KV
    await Promise.all(
      siteList.map(async (site) => {
        // Store site details with site ID as key
        await env.WEBFLOW_AUTHENTICATION.put(
          site.id,
          JSON.stringify({ accessToken, siteName: site.shortName }),
          { expirationTtl: 86400 }
        );

        // Store site name to ID mapping
        await env.WEBFLOW_AUTHENTICATION.put(
          `site-name:${site.shortName}`,
          site.id,
          { expirationTtl: 86400 }
        );
      })
    );

    const isAppPopup = searchParams.get("state") === "webflow_designer";

    if (isAppPopup) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head><title>Authorization Complete</title></head>
          <body>
            <script>
              window.opener.postMessage('authComplete', '*');
              window.close();
            </script>
          </body>
        </html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    } else {
      const workspaceIds = authInfo?.authorization?.authorizedTo?.workspaceIds ?? [];
      if (workspaceIds.length > 0) {
        return NextResponse.redirect(new URL(`https://webflow.com/dashboard?workspace=${workspaceIds[0]}`));
      }
      const firstSite = siteList[0];
      if (firstSite) {
        return NextResponse.redirect(new URL(`https://${firstSite.shortName}.design.webflow.com?app=${process.env.CLIENT_ID}`));
      }
    }
  } catch (error) {
    console.error("Error during OAuth callback:", error);
    return NextResponse.json({ 
      error: "Failed to process authorization", 
      details: error instanceof Error ? error.message : String(error),
      // Add environment check
      envCheck: {
        hasClientId: !!process.env.CLIENT_ID,
        hasClientSecret: !!process.env.CLIENT_SECRET,
        hasKV: !!env.WEBFLOW_AUTHENTICATION
      }
    }, { status: 500 });
  }
}