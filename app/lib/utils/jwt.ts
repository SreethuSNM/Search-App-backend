import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Define interfaces
interface User {
  id: string;
  email: string;
}

interface JWTPayload {
  user: User;
}

interface AuthRequestBody {
  siteId: string;
  idToken: string;
}

const createSessionToken = async (user: User) => {
  const secret = new TextEncoder().encode(process.env.WEBFLOW_CLIENT_SECRET);

  const sessionToken = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);

  const decodedToken = await jwtVerify(sessionToken, secret);

  return {
    sessionToken,
    exp: decodedToken.payload.exp,
  };
};

const verifyAuth = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("authorization");
  const sessionToken = authHeader?.split(" ")[1];
  console.log("inside verify auth session", sessionToken);

  if (!sessionToken) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(process.env.WEBFLOW_CLIENT_SECRET);
    const { payload } = (await jwtVerify(sessionToken, secret)) as {
      payload: JWTPayload;
    };
    const userId = payload.user.id;

    const { env } = await getCloudflareContext({ async: true });
    const stored = await env.WEBFLOW_AUTHENTICATION.get(`user-auth:${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log("inside verify auth access token", parsed.accessToken);
      return parsed.accessToken;
    }
    return null;
  } catch {
    // Remove the unused error parameter
    return null;
  }
};

const getAccessToken = async (request: NextRequest): Promise<string | null> => {
  try {
    let siteId: string | null = null;
    if (request.method === "POST") {
      const body = (await request.json()) as AuthRequestBody;
      siteId = body.siteId;
    } else if (request.method === "GET") {
      siteId = request.nextUrl.searchParams.get("siteId");
    }

    if (!siteId) {
      console.error("No siteId provided in request.");
      return null;
    }

    const { env } = await getCloudflareContext({ async: true });
    const stored = await env.WEBFLOW_AUTHENTICATION.get(`site-auth:${siteId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.accessToken;
    }

    console.error(`No access token found for site ${siteId}`);
    return null;
  } catch (err) {
    // Log the error instead of ignoring it
    console.error("Error getting access token:", err);
    return null;
  }
};

const jwtUtils = {
  createSessionToken,
  verifyAuth,
  getAccessToken,
};

export default jwtUtils;