import { NextResponse } from 'next/server';
import { SecurityUtils } from './security';

export default function withCORS(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
  SecurityUtils.addSecurityHeaders(response.headers);
  return response;
}

export async function handleOptions() {
  return withCORS(new NextResponse(null, { status: 204 }));
} 