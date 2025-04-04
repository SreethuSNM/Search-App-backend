
import { jwtVerify } from 'jose';

import { JWTPayload} from 'jose';
import findSiteDetails from './find-site-details';

interface VisitorTokenPayload extends JWTPayload {
    visitorId: string;
    userAgent: string;
    siteName: string;
    timestamp: number;
    [key: string]: unknown; // Add index signature
}

interface TokenVerificationResult {
    isValid: boolean;
    error?: string;
    payload?: VisitorTokenPayload;
    visitorId?: string;
    siteName?: string;
}



export async function verifyToken(token: string, siteName: string): Promise<TokenVerificationResult> {
    try {
        console.log("inside verify visitor token", token);
        if (!token) {
            console.log("inside verify visitor token : no token");
            return { isValid: false, error: 'No token provided' };
        }

        // First, decode the token to get the siteName without verification
        const [payloadBase64] = token.split('.');
        if (!payloadBase64) {
            return { isValid: false, error: 'Invalid token format' };
        }

        let payload: VisitorTokenPayload;
        try {
            payload = JSON.parse(atob(payloadBase64)) as VisitorTokenPayload;
        } catch (e) {
            console.error('Failed to decode token payload:', e);
            return { isValid: false, error: 'Invalid token format' };
        }
        console.log("payload",payload);
     
        console.log("inside verify visitor token: sitename", siteName);

        // if (!siteName) {
        //     return { isValid: false, error: 'Invalid token: siteName not found' };
        // }

        // Find site details to get accessToken for verification
        const siteDetails = await findSiteDetails(siteName);
        console.log("inside verify visitor token: sitedetails", siteDetails);

        if (!siteDetails) {
            return { isValid: false, error: 'Site not found' };
        }

        // Now verify the token using the site's accessToken
        const { payload: verifiedPayload } = await jwtVerify(
            token,
            new TextEncoder().encode(siteDetails.accessToken)
        ) as { payload: VisitorTokenPayload };

        // Check if token is expired
        if (verifiedPayload.exp && verifiedPayload.exp < Math.floor(Date.now() / 1000)) {
            return { isValid: false, error: 'Token expired' };
        }

        return { 
            isValid: true, 
            payload: verifiedPayload,
            visitorId: verifiedPayload.visitorId,
            siteName: verifiedPayload.siteName
        };
    } catch (error) {
        console.error('Token verification failed:', error);
        return { isValid: false, error: 'Invalid token' };
    }
}