import { NextResponse } from 'next/server';
import { SignJWT, JWTPayload } from 'jose';
import findSiteDetails from '@/app/lib/utils/find-site-details';

interface VisitorTokenPayload extends JWTPayload {
    visitorId: string;
    userAgent: string;
    siteName: string;
    timestamp: number;
    [key: string]: unknown; // Add index signature
}




function withCORS(response: NextResponse, origin: string | null) {
    const headers = new Headers(response.headers);
    
    // Set specific origin instead of wildcard
    const allowedOrigin = origin || 'https://consentbits-stellar-site.webflow.io';
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");

    return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
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