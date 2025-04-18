import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TokenVerificationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Verifies a visitor session token
 * @param token The token to verify
 * @param siteName The site name to verify against
 * @returns Promise<TokenVerificationResult>
 */
export async function verifyToken(token: string, siteName: string): Promise<TokenVerificationResult> {
    try {
        console.log(`Verifying token for site: ${siteName}`);
        console.log(`Token to verify: ${token}`);
        
        const context = await getCloudflareContext();
        if (!context?.env?.WEBFLOW_AUTHENTICATION) {
            console.error("KV binding missing");
            return { isValid: false, error: "KV binding missing" };
        }

        // Get the stored token for this site
        const kvKey = `visitor-token:${siteName}`;
        console.log(`Looking up token with key: ${kvKey}`);
        
        const storedToken = await context.env.WEBFLOW_AUTHENTICATION.get(kvKey);
        console.log(`Stored token: ${storedToken ? 'Found' : 'Not found'}`);
        
        if (!storedToken) {
            return { isValid: false, error: "No token found for site" };
        }

        // Compare the tokens
        if (token !== storedToken) {
            console.log(`Token mismatch. Expected: ${storedToken}, Got: ${token}`);
            return { isValid: false, error: "Invalid token" };
        }

        console.log(`Token verified successfully for site: ${siteName}`);
        return { isValid: true };
    } catch (error) {
        console.error("Token verification error:", error);
        return { isValid: false, error: "Token verification failed" };
    }
} 