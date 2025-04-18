// // app/api/analytics/save-categories/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { getCloudflareContext } from "@opennextjs/cloudflare";
// import withCORS from "@/app/lib/utils/cors";
// import jwt from "../../lib/utils/jwt"
// import { EncryptionUtils } from "@/app/lib/encryption-utils";

// interface ScriptCategory {
//   src: string | null;
//   content: string | null;
//   selectedCategories: string[];
// }

// interface SaveCategoriesRequest {
//   scripts: string; // encrypted data
//   key: number[]; // exported key
//   iv: number[]; // initialization vector
// }

// export async function OPTIONS() {
//   return withCORS(new NextResponse(null, { status: 204 }));
// }

// export async function POST(request: NextRequest) {
//   try {
//     const { env } = await getCloudflareContext({ async: true });
//     const body = await request.json() as SaveCategoriesRequest;
//     const { scripts: encryptedData, key, iv } = body;

//     if (!encryptedData || !key || !iv) {
//       return withCORS(NextResponse.json(
//         { success: false, error: "Missing required encryption parameters" },
//         { status: 400 }
//       ));
//     }

//     // Verify site authentication using the session token
//     const accessToken = await jwt.verifyAuth(request);
    
//     if (!accessToken) {
//       console.error("Authentication failed:", accessToken);
//       return withCORS(NextResponse.json({ 
//         error: "Unauthorized",
//         details: accessToken || "Authentication failed"
//       }, { status: 401 }));
//     }

//     const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
//     if (!siteId) {
//       console.error("SiteId not found:", siteId);
//       return withCORS(NextResponse.json({ 
//         error: "Unauthorized",
//         details: siteId || "SiteId failed"
//       }, { status: 401 }));
//     }

//     // Import the key
//     const importedKey = await EncryptionUtils.importKey(
//       new Uint8Array(key),
//       ['decrypt']
//     );

//     // Decrypt the data
//     const decryptedData = await EncryptionUtils.decrypt(
//       encryptedData,
//       importedKey,
//       new Uint8Array(iv)
//     );

//     // Parse the decrypted data
//     const { scripts } = JSON.parse(decryptedData);

//     if (!scripts || !Array.isArray(scripts)) {
//       return withCORS(NextResponse.json(
//         { success: false, error: "Invalid script data format" },
//         { status: 400 }
//       ));
//     }

//     // Store the script categories in Cloudflare KV
//     await env.WEBFLOW_AUTHENTICATION.put(
//       `script-categories:${siteId}`,
//       JSON.stringify(scripts),
//       { expirationTtl: 86400 * 30 } // 30 days expiration
//     );

//     return withCORS(NextResponse.json({ success: true }));
//   } catch (error) {
//     console.error("Error saving script categories:", error);
//     return withCORS(NextResponse.json(
//       { success: false, error: "Failed to save script categories" },
//       { status: 500 }
//     ));
//   }
// }

// app/api/analytics/save-categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import withCORS from "@/app/lib/utils/cors";
import jwt from "../../lib/utils/jwt"
import { EncryptionUtils } from "@/app/lib/encryption-utils";


interface SaveCategoriesRequest {
  scripts: string; // encrypted data
  key: number[]; // exported key
  iv: number[]; // initialization vector
}

export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const body = await request.json() as SaveCategoriesRequest;
    const { scripts: encryptedData, key, iv } = body;

    if (!encryptedData || !key || !iv) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing required encryption parameters" },
        { status: 400 }
      ));
    }

    // Verify site authentication using the session token
    const accessToken = await jwt.verifyAuth(request);
    
    if (!accessToken) {
      console.error("Authentication failed:", accessToken);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: accessToken || "Authentication failed"
      }, { status: 401 }));
    }

    const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
    if (!siteId) {
      console.error("SiteId not found:", siteId);
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: siteId || "SiteId failed"
      }, { status: 401 }));
    }

    // Import the key
    const importedKey = await EncryptionUtils.importKey(
      new Uint8Array(key),
      ['decrypt']
    );

    // Decrypt the data
    const decryptedData = await EncryptionUtils.decrypt(
      encryptedData,
      importedKey,
      new Uint8Array(iv)
    );

    // Parse the decrypted data
    const { scripts } = JSON.parse(decryptedData);

    if (!scripts || !Array.isArray(scripts)) {
      return withCORS(NextResponse.json(
        { success: false, error: "Invalid script data format" },
        { status: 400 }
      ));
    }

    // Store the script categories in Cloudflare KV
    await env.WEBFLOW_AUTHENTICATION.put(
      `script-categories:${siteId}`,
      JSON.stringify(scripts),
      { expirationTtl: 86400 * 30 } // 30 days expiration
    );

    return withCORS(NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Error saving script categories:", error);
    return withCORS(NextResponse.json(
      { success: false, error: "Failed to save script categories" },
      { status: 500 }
    ));
  }
}