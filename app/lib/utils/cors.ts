import { NextResponse } from 'next/server';
// CORS configuration types
export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge: number;
  allowCredentials: boolean;
}

// Default CORS configuration
export const defaultCorsConfig: CorsConfig = {
  allowedOrigins: ['*'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
    'X-Request-ID'
  ],
  maxAge: 86400,
  allowCredentials: true
};

// CORS headers generator
export function generateCorsHeaders(config: CorsConfig = defaultCorsConfig) {
  const headers = new Headers();
  
  // Handle origin
  const origin = config.allowedOrigins.includes('*') 
    ? '*' 
    : config.allowedOrigins.join(', ');
  headers.set('Access-Control-Allow-Origin', origin);
  
  // Set other CORS headers
  headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
  headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  headers.set('Access-Control-Max-Age', config.maxAge.toString());
  
  if (config.allowCredentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  headers.set('Vary', 'Origin');
  
  return headers;
}

/**
 * Adds CORS headers to a NextResponse
 */
export function withCORS(response: NextResponse, config: CorsConfig = defaultCorsConfig) {
  const corsHeaders = generateCorsHeaders(config);
  
  // Merge existing headers with CORS headers
  response.headers.forEach((value, key) => {
    corsHeaders.set(key, value);
  });
  
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders,
  });
}

/**
 * Creates a CORS-enabled JSON response
 */
export function corsResponse<T>(data: T, status: number = 200, config: CorsConfig = defaultCorsConfig) {
  return withCORS(
    NextResponse.json(data, { status }),
    config
  );
}

/**
 * Creates a CORS-enabled error response
 */
export function corsErrorResponse(message: string, status: number = 400, config: CorsConfig = defaultCorsConfig) {
  return corsResponse({ error: message }, status, config);
}

/**
 * Handles OPTIONS preflight requests
 */
export async function handleOptions(config: CorsConfig = defaultCorsConfig) {
  return withCORS(
    new NextResponse(null, { status: 204 }),
    config
  );
}

// Export a default configuration for quick access
export const corsConfig = defaultCorsConfig;

// Default export for convenience
export default withCORS; 