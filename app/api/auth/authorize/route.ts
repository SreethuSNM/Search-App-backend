import { WebflowClient } from "webflow-api";
import { NextResponse } from "next/server";
import { OauthScope } from "webflow-api/api/types/OAuthScope";

/**
 * Authorize API Route Handler
 * --------------------------
 * This route generates and redirects to Webflow's authorization URL.
 */
export const runtime = "nodejs";

const scopes: OauthScope[] = [
  "sites:read",
  "sites:write",
  "cms:read",
  "pages:read",
  "authorized_user:read",
  "custom_code:read",
  "custom_code:write",  
];

export async function GET(request: Request) {
  console.log(request);
  const { searchParams } = new URL(request.url);
  const isDesigner = searchParams.get("state") === "webflow_designer";
  console.log("is Designer",isDesigner)

  const authorizeUrl = WebflowClient.authorizeURL({
    scope: scopes as OauthScope[],
    clientId: process.env.CLIENT_ID!,  // ✅ Use process.env here
    state: isDesigner ? "webflow_designer" : undefined,
  });

  return NextResponse.redirect(authorizeUrl);
}
