import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { EncryptionUtils } from "@/app/lib/encryption-utils";
import { verifyToken } from '@/app/lib/utils/token';
import  findSiteDetails  from '@/app/lib/utils/find-site-details';

// Allowed origins for CORS
// const ALLOWED_ORIGINS = [
//   'https://consentbits-stellar-site.webflow.io',
//   'https://*.webflow.io',
//   'http://localhost:3000'
// ];

/**
 * Add CORS headers to the response.
 */
function withCORS(response: NextResponse, ) {
  const headers = new Headers(response.headers);
  
  // Determine allowed origin
  // const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
  //   allowed.includes('*') ? origin.endsWith(allowed.replace('*', '')) : allowed === origin
  // ) ? origin : ALLOWED_ORIGINS[0];

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token, X-Request-ID");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Helper to create a CORS-enabled error response.
 */
function errorResponse(message: string, status: number) {
  return withCORS(
    new NextResponse(JSON.stringify({ error: message }), { status }),
    
  );
}

/**
 * Handle preflight OPTIONS request.
 */
export async function OPTIONS() {
  // const origin = request.headers.get("origin");
  // const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
  //   allowed.includes('*') ? origin.endsWith(allowed.replace('*', '')) : allowed === origin
  // ) ? origin : ALLOWED_ORIGINS[0];

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token, X-Request-ID",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    },
  });
}

interface RequestBodyType {
  encryptedData: string;
  key: number[];
  iv: number[];
}

/**
 * POST: Retrieve script categories from KV after token verification.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }
  
    const token = authHeader.split(" ")[1];
    
    // Get encrypted data from request body
    const body = await request.json();
    const { encryptedData, key, iv } = body as RequestBodyType;
    
    if (!encryptedData || !key || !iv) {
      return errorResponse("Missing encrypted data or encryption parameters", 400);
    }

    // Convert key and IV arrays to Uint8Array
    const keyBytes = new Uint8Array(key);
    const ivBytes = new Uint8Array(iv);

    // Import the key for decryption
    const cryptoKey = await EncryptionUtils.importKey(keyBytes, ['decrypt']);

    // Decrypt the request data
    const decryptedData = await EncryptionUtils.decrypt(encryptedData, cryptoKey, ivBytes);
    const { siteName, visitorId } = JSON.parse(decryptedData);
    
    if (!siteName) {
      return errorResponse("Site name is required", 400);
    }
    
    try {
      const { isValid, error } = await verifyToken(token, siteName);
      if (!isValid) {
        return errorResponse(error || "Invalid token or site name", 401);
      }
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);
      return errorResponse("Token verification failed", 401);
    }
    
    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      return errorResponse("Site details not found", 404);
    }
    
    const context = await getCloudflareContext();
    if (!context?.env?.WEBFLOW_AUTHENTICATION) {
      console.error("KV binding missing or misconfigured");
      return errorResponse("Internal server error: KV binding missing", 500);
    }
    
    const kvKey = `script-categories:${siteDetails.siteId}`;
    const value = await context.env.WEBFLOW_AUTHENTICATION.get(kvKey);
    
    if (!value) {
      // Generate new encryption key for empty response
      const { key: responseKey, iv: responseIv } = await EncryptionUtils.generateKey();
      const emptyResponse = {
        scripts: [],
        message: "No script categories found for this site"
      };
      
      // Encrypt the empty response
      const encryptedResponse = await EncryptionUtils.encrypt(
        JSON.stringify(emptyResponse),
        responseKey,
        responseIv
      );
      
      // Export the key for client use
      const exportedKey = await crypto.subtle.exportKey('raw', responseKey);
      
      return withCORS(
        new NextResponse(JSON.stringify({
          encryptedData: encryptedResponse,
          key: Array.from(new Uint8Array(exportedKey)),
          iv: Array.from(responseIv)
        }), { status: 200 })
      );
    }
    
    try {
      const scriptData = JSON.parse(value);
      
      // Generate new encryption key for response
      const { key: responseKey, iv: responseIv } = await EncryptionUtils.generateKey();
      
      // Prepare response data
      const responseData = {
        scripts: scriptData,
        visitorId: visitorId
      };
      
      // Encrypt the response
      const encryptedResponse = await EncryptionUtils.encrypt(
        JSON.stringify(responseData),
        responseKey,
        responseIv
      );
      
      // Export the key for client use
      const exportedKey = await crypto.subtle.exportKey('raw', responseKey);
      
      return withCORS(
        new NextResponse(JSON.stringify({
          encryptedData: encryptedResponse,
          key: Array.from(new Uint8Array(exportedKey)),
          iv: Array.from(responseIv)
        }), { status: 200 })
      );
    } catch (parseError) {
      console.error("Failed to parse script data:", parseError);
      return errorResponse("Error parsing script categories", 500);
    }
  } catch (err) {
    console.error("Unexpected error in POST handler:", err);
    return errorResponse("Internal server error", 500);
  }
}