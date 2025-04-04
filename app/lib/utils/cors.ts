import { NextResponse } from 'next/server';
import { SecurityUtils } from './security';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export function withCORS(response: NextResponse) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  SecurityUtils.addSecurityHeaders(response.headers);
  return response;
}

export function corsResponse<T>(data: T, status: number = 200) {
  return withCORS(NextResponse.json(data, { status }));
}

export async function handleOptions() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

// Add default export
export default withCORS; 