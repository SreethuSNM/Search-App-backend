import { NextResponse } from 'next/server';
import { SignJWT, JWTPayload } from 'jose';
import findSiteDetails from '@/app/lib/utils/find-site-details';
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface VisitorTokenPayload extends JWTPayload {
    visitorId: string;
    userAgent: string;
    siteName: string;
    timestamp: number;
    [key: string]: unknown; // Add index signature
}

// Helper function to add CORS headers
function withCORS(response: NextResponse, origin: string | null): NextResponse {
    if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    return response;
}

// Handle preflight requests
export async function OPTIONS(request: Request) {
    const origin = request.headers.get("origin");
    return withCORS(new NextResponse(null, { status: 204 }), origin);
}

export async function POST(request: Request): Promise<NextResponse> {
    const origin = request.headers.get("origin");
    try {
        const body = await request.json() as VisitorTokenPayload;
        const { visitorId, userAgent, siteName } = body;
        console.log(" visitor-token",visitorId,userAgent,siteName)

        if (!visitorId || !siteName) {
            return withCORS(
                NextResponse.json(
                    { error: 'Visitor ID and site name are required' },
                    { status: 400 }
                ),
                origin
            );
        }

        // Find site details by searching through KV values
        const siteDetails = await findSiteDetails(siteName);
        if (!siteDetails) {
            return withCORS(
                NextResponse.json(
                    { error: 'Site not found' },
                    { status: 404 }
                ),
                origin
            );
        }

        // Generate JWT token using the found accessToken
        const token = await new SignJWT({
            visitorId,
            userAgent,
            siteName,
            timestamp: Date.now()
        })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .sign(new TextEncoder().encode(siteDetails.accessToken));

        // Store the token in KV with the correct key format
        const { env } = await getCloudflareContext();
        if (!env?.WEBFLOW_AUTHENTICATION) {
            return withCORS(
                NextResponse.json(
                    { error: 'KV binding missing' },
                    { status: 500 }
                ),
                origin
            );
        }

        // Store token with site-specific key
        const kvKey = `visitor-token:${siteName}`;
        await env.WEBFLOW_AUTHENTICATION.put(kvKey, token, { expirationTtl: 86400 }); // 24 hours

        return withCORS(
            NextResponse.json({
                token,
                visitorId
            }),
            origin
        );
    } catch (error) {
        console.error('Error generating visitor token:', error);
        return withCORS(
            NextResponse.json(
                { error: 'Internal server error' },
                { status: 500 }
            ),
            origin
        );
    }
}