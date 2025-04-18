import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyToken } from "@/app/lib/utils/visitor-token-verifiy";
import findSiteDetails from "@/app/lib/utils/find-site-details";

// --- Interfaces ---
interface EncryptedData {
  encryptedPreferences: string;
  encryptionKey: {
    key: string; // Base64-encoded string
    iv: string;  // Base64-encoded string
  };
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
  encryptedVisitorId: EncryptedData;
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

function withCORS(response: NextResponse) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token");
    headers.set("Access-Control-Max-Age", "86400");

    return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token",
            "Access-Control-Max-Age": "86400"
        },
    });
}

export async function POST(request: NextRequest) {
    try {
        const data: ConsentRequest = await request.json();
        console.log("INSIDE CONSENT SAVE POST REQUEST:", data);

        const { env } = await getCloudflareContext({ async: true });

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return withCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
        }

        const token = authHeader.split(" ")[1];
        const rawUrl = data.clientId.startsWith("http") ? data.clientId : `https://${data.clientId}`;
        const url = new URL(rawUrl);
        const hostname = url.hostname.replace(/^www\./, "");

        const siteName = hostname
            .replace(/\.webflow\.io$/, "")
            .replace(/\.(com|net|org|io|co|dev|xyz|info|studio)$/, "");

        const { isValid, error } = await verifyToken(token, siteName);
        if (!isValid) {
            return withCORS(NextResponse.json({ error: error || "Invalid site name" }, { status: 401 }));
        }

        const siteDetails = await findSiteDetails(siteName);
        if (!siteDetails) {
            return withCORS(NextResponse.json({ error: "Site details not found" }, { status: 404 }));
        }

        // Validate Encryption Keys
        if (!data.encryptedVisitorId?.encryptionKey?.key ||
            !data.encryptedVisitorId?.encryptionKey?.iv ||
            !data.preferences?.encryptionKey?.key ||
            !data.preferences?.encryptionKey?.iv) {
            return badRequestResponse("Missing encryption key or IV in request");
        }

        // Decrypt Encrypted Fields
        const decryptedVisitorId = await decryptData(
            data.encryptedVisitorId.encryptedPreferences,
            await importKey(base64ToUint8Array(data.encryptedVisitorId.encryptionKey.key)),
            base64ToUint8Array(data.encryptedVisitorId.encryptionKey.iv)
        );

        let decryptedPreferences;
        try {
            const decryptedPrefsStr = await decryptData(
                data.preferences.encryptedPreferences,
                await importKey(base64ToUint8Array(data.preferences.encryptionKey.key)),
                base64ToUint8Array(data.preferences.encryptionKey.iv)
            );
            decryptedPreferences = JSON.parse(decryptedPrefsStr);
            console.log("Decrypted preferences:", decryptedPreferences);
        } catch (error) {
            console.error("Error decrypting preferences:", error);
            return badRequestResponse("Invalid preferences format");
        }

        if (!data.clientId || !decryptedVisitorId || !decryptedPreferences) {
            return badRequestResponse("Missing required fields");
        }

        const ip = request.headers.get("CF-Connecting-IP") || "unknown-ip";
        const country = data.country || "unknown-country";

        // Construct Consent Data
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
            bannerType: data.bannerType
        };

        if (data.bannerType === "GDPR") {
            const gdprPrefs = decryptedPreferences.gdpr || decryptedPreferences;
            consentData.preferences = {
                necessary: true,
                marketing: Boolean(gdprPrefs.Marketing ?? gdprPrefs.marketing ?? false),
                personalization: Boolean(gdprPrefs.Personalization ?? gdprPrefs.personalization ?? false),
                analytics: Boolean(gdprPrefs.Analytics ?? gdprPrefs.analytics ?? false),
                lastUpdated: gdprPrefs.lastUpdated || data.timestamp,
                country,
                ip,
            };
        } else if (data.bannerType === "CCPA") {
            const ccpaPrefs = decryptedPreferences.ccpa || decryptedPreferences;
            consentData.preferences = {
                necessary: true,
                doNotShare: Boolean(ccpaPrefs.DoNotShare ?? ccpaPrefs.doNotShare ?? false),
                doNotSell: Boolean(ccpaPrefs.DoNotSell ?? ccpaPrefs.doNotSell ?? false),
                limitUse: Boolean(ccpaPrefs.LimitUse ?? ccpaPrefs.limitUse ?? false),
                lastUpdated: ccpaPrefs.lastUpdated || data.timestamp,
                country,
                ip,
            };
        }

        const kvKey = `Cookie-Preferences:${data.clientId}:${decryptedVisitorId}`;
        console.log("KV key to store:", kvKey);
        console.log("---CONSENT DATA", consentData);

        try {
            await env.WEBFLOW_AUTHENTICATION.put(kvKey, JSON.stringify(consentData));
        } catch (error: unknown) {
            return internalServerErrorResponse("Error saving to KV", error instanceof Error ? error : new Error(String(error)));
        }

        return withCORS(
            new NextResponse(
                JSON.stringify({
                    message: "Consent data saved successfully",
                    consentData,
                }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            )
        );

    } catch (error: unknown) {
        return withCORS(
            NextResponse.json(
                {
                    error: "Internal Server Error",
                    details: error instanceof Error ? error.message : "Unknown error occurred"
                },
                { status: 500 }
            )
        );
    }
}

function badRequestResponse(message: string) {
    return withCORS(
        NextResponse.json(
            { error: "Bad Request", details: message },
            { status: 400 }
        )
    );
}

function internalServerErrorResponse(message: string, error: Error) {
    console.error(message, error.message);
    return withCORS(
        NextResponse.json(
            { error: message, details: error.message || "Internal Server Error" },
            { status: 500 }
        )
    );
}

// Crypto Helper Functions
function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
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
        { name: "AES-GCM", iv },
        key,
        encryptedBytes
    );
    return new TextDecoder().decode(decryptedBuffer);
}