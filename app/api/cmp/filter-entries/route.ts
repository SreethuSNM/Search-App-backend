import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import findSiteDetails from "@/app/lib/utils/find-site-details";
import { verifyToken } from "@/app/lib/utils/visitor-token-verifiy";
// Helper function to add CORS headers
function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

// Handle preflight requests
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

interface KVEntry {
  name: string;
  metadata: {
    expiration?: number;
    size?: number;
  };
}

interface KVListResult {
  keys: KVEntry[];
  cursor?: string;
  list_complete: boolean;
}

interface CookieData {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  category?: 'necessary' | 'marketing' | 'personalization' | 'analytics' | 'other';
}

interface CookieCategories {
  necessary: CookieData[];
  marketing: CookieData[];
  personalization: CookieData[];
  analytics: CookieData[];
  other: CookieData[];
}

interface ConsentEntry {
  siteId: string;
  visitorId: string;
  preferences: {
    necessary?: boolean;
    marketing?: boolean;
    personalization?: boolean;
    analytics?: boolean;
    doNotShare?: boolean;
    lastUpdated?: string;
    country?: string;
    ip?: string;
  };
  metadata?: {
    country?: string;
    userAgent?: string;
    ip?: string;
    timestamp?: string;
  };
  timestamp?: string;
  lastUpdated?: string;
  cookies?: CookieCategories;
}







async function filterKVByClientId(siteId :string) {
    let cursor: string | null = null;
    const filteredEntries: ConsentEntry[] = [];
    let pageCount = 0;  
   
  const { env } = await getCloudflareContext({ async: true });
 

       
    do {
      console.log('Fetching page:', pageCount + 1);
      
      const kvEntries = await env.CMP_MANUAL.list({ cursor, limit: 100 }) as KVListResult;
      cursor = kvEntries.cursor || null;
      
      console.log('Entries in current page:', kvEntries.keys.length);
  
      for (const entry of kvEntries.keys) {
        try {
          const value = await env.WEBFLOW_AUTHENTICATION.get(entry.name);
          if (value) {
            const parsedValue = JSON.parse(value) as ConsentEntry;
            if (parsedValue.siteId === siteId) {
              if (!parsedValue.cookies) {
                parsedValue.cookies = {
                  necessary: [],
                  marketing: [],
                  personalization: [],
                  analytics: [],
                  other: []
                };
              }
              filteredEntries.push(parsedValue);
              console.log('Found matching entry:', entry.name);
            }
          }
        } catch (error) {
          console.error('Error processing entry:', entry.name, error);
        }
      }
      pageCount++;
      console.log('Total matching entries so far:', filteredEntries.length);
  
    } while (cursor && pageCount < 10);
  
    console.log('Total pages processed:', pageCount);
    console.log('Final number of entries:', filteredEntries.length);
  
    return filteredEntries;
  }
  

export async function POST(request: NextRequest) {
  try {
   
    
  
              const authHeader = request.headers.get('Authorization');
              if (!authHeader || !authHeader.startsWith('Bearer ')) {
                  return withCORS(NextResponse.json(
                      { error: 'Unauthorized' },
                      { status: 401 }
                  ));
              }
        const siteName="sitename"
              const token = authHeader.split(' ')[1];
              const { isValid, error} = await verifyToken(token,siteName);
      
              if (!isValid || !siteName) {
                  return withCORS(NextResponse.json(
                      { error: error || 'Invalid site name' },
                      { status: 401 }
                  ));
              }
      
              // Get site details
              const siteDetails = await findSiteDetails(siteName);
              if (!siteDetails) {
                  return withCORS(NextResponse.json(
                      { error: 'Site details not found' },
                      { status: 404 }
                  ));
              }
      
  

    const filteredData = await filterKVByClientId(siteDetails.siteId);
    console.log('Total entries retrieved:', filteredData.length);
  
    const formattedOutput = {
      title: "Filtered Consent Entries",
      entries: filteredData.map((entry, index) => ({
        entryNumber: index + 1,
        siteId: entry.siteId,
        visitorId: entry.visitorId,
        preferences: entry.preferences,
        metadata: entry.metadata || {},
        timestamp: entry.timestamp || entry.lastUpdated,
        cookies: entry.cookies || {
          necessary: [],
          marketing: [],
          personalization: [],
          analytics: [],
          other: []
        },
      }))
    };
    
    return withCORS(NextResponse.json(formattedOutput));
    
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error applying custom code:", error.message);
      return withCORS(NextResponse.json({ 
        error: "Failed to apply custom code",
        details: error.message
      }, { status: 500 }));
    } else {
      console.error("Unknown error:", error);
      return withCORS(NextResponse.json({ 
        error: "Failed to apply custom code",
        details: "An unknown error occurred"
      }, { status: 500 }));
    }
  }
}
