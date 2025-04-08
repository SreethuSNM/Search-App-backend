import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyToken } from "@/app/lib/utils/visitor-token-verifiy";
import findSiteDetails from "@/app/lib/utils/find-site-details";

// --- Interfaces ---

interface EncryptedData {
  encryptedData: string;
  iv: number[];
  key: number[];
}

interface ConsentCookies {
  necessary?: Record<string, unknown>[];
  marketing?: Record<string, unknown>[];
  personalization?: Record<string, unknown>[];
  analytics?: Record<string, unknown>[];
  other?: Record<string, unknown>[];
}

interface ConsentRequest {
  clientId: string;
  visitorId: EncryptedData;
  preferences: EncryptedData;
  metadata?: {
    userAgent: string;
    language: string;
    platform: string;
    timezone: string;
    ip?: string;
  };
  policyVersion: string;
  timestamp: string;
  cookies: ConsentCookies;
  country: string;
  bannerType: string;
}

// --- Preflight for CORS ---
// --- CORS Helper ---

function withCORS(response: NextResponse | Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


export async function OPTIONS() {
  return withCORS(new Response(null, { status: 204 }));
}

// --- Main POST handler ---

export async function POST(request: NextRequest) {
  try {
    const data: ConsentRequest = await request.json();
    console.log("INSIDE CONSENT SAVE POST REQUEST:", data);

    const { env } = await getCloudflareContext({ async: true });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return withCORS(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const token = authHeader.split(" ")[1];
    const rawUrl = data.clientId.startsWith("http")
      ? data.clientId
      : `https://${data.clientId}`;
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "");

    const siteName = hostname
      .replace(/\.webflow\.io$/, "")
      .replace(/\.(com|net|org|io|co|dev|xyz|info|studio)$/, "");

    const { isValid, error } = await verifyToken(token, siteName);
    if (!isValid) {
      return withCORS(
        NextResponse.json(
          { error: error || "Invalid site name" },
          { status: 401 }
        )
      );
    }

    const siteDetails = await findSiteDetails(siteName);
    if (!siteDetails) {
      return withCORS(
        NextResponse.json({ error: "Site details not found" }, { status: 404 })
      );
    }

    // Decrypt visitor ID & preferences
    const decryptedVisitorId = await decryptData(
      data.visitorId.encryptedData,
      await importKey(Uint8Array.from(data.visitorId.key)),
      Uint8Array.from(data.visitorId.iv)
    );

    const decryptedPreferences = await decryptData(
      data.preferences.encryptedData,
      await importKey(Uint8Array.from(data.preferences.key)),
      Uint8Array.from(data.preferences.iv)
    );

    const preferences = JSON.parse(decryptedPreferences);

    if (!data.clientId || !decryptedVisitorId || !preferences) {
      return badRequestResponse("Missing required fields");
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown-ip";
    const country = data.country || "unknown-country";
    console.log("Captured IP Address:", ip);

    // Construct consent data
    const consentData = {
      clientId: data.clientId,
      visitorId: decryptedVisitorId,
      timestamp: new Date().toISOString(),
      metadata: {
        ...data.metadata,
        ip,
      },
      policyVersion: data.policyVersion,
      lastUpdated: new Date().toISOString(),
      preferences: {},
      cookies: data.cookies,
    };

    if (data.bannerType === "GDPR") {
      consentData.preferences = {
        necessary: preferences.necessary,
        marketing: preferences.marketing,
        personalization: preferences.personalization,
        analytics: preferences.analytics,
        lastUpdated: new Date().toISOString(),
        country,
        ip,
      };
    } else if (data.bannerType === "CCPA") {
      consentData.preferences = {
        doNotShare: preferences.doNotShare || false,
        lastUpdated: new Date().toISOString(),
        country,
        ip,
      };
    }

    const kvKey = `Cookie-Preferences:${data.clientId}:${decryptedVisitorId}`;
    console.log("KV key to store:", kvKey);

    try {
      await env.WEBFLOW_AUTHENTICATION.put(kvKey, JSON.stringify(consentData));
    } catch (error: unknown) {
      if (error instanceof Error) {
        return internalServerErrorResponse("Error processing consent", error);
      } else {
        return internalServerErrorResponse(
          "Unknown error occurred",
          new Error(String(error))
        );
      }
    }

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `visitor-id=${decryptedVisitorId}; Path=/; HttpOnly; Secure; SameSite=Lax`
    );
    headers.append(
      "Set-Cookie",
      `consent-preferences=${JSON.stringify({
        necessary: preferences.necessary,
        marketing: preferences.marketing,
        personalization: preferences.personalization,
        analytics: preferences.analytics,
        doNotShare: preferences.doNotShare || false,
        country,
        ip,
      })}; Path=/; Max-Age=31536000; Secure; SameSite=Strict`
    );

    return new Response(
      JSON.stringify({
        message: "Consent data saved successfully",
        consentData,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      return internalServerErrorResponse("Error processing consent", error);
    } else {
      return internalServerErrorResponse("Unknown error occurred");
    }
  }
}



// --- Error Helpers ---

function badRequestResponse(message: string) {
  return withCORS(
    NextResponse.json({ error: "Bad Request", details: message }, { status: 400 })
  );
}

function internalServerErrorResponse(message: string, error?: Error) {
  console.error(message, error?.message);
  return withCORS(
    NextResponse.json(
      { error: message, details: error?.message || "Internal Server Error" },
      { status: 500 }
    )
  );
}

// --- AES-GCM Crypto Helpers ---

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptData(
  encryptedBase64: string,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  const encryptedBytes = base64ToUint8Array(encryptedBase64);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encryptedBytes
  );

  return new TextDecoder().decode(decryptedBuffer);
}
