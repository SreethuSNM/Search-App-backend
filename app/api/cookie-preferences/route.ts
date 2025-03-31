import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import jwt from "../../lib/utils/jwt";
import withCORS from "../../lib/utils/cors";

interface CookiePreferences {
    visitorId: string;
    preferences: {
      necessary: boolean;
      marketing: boolean;
      personalization: boolean;
      analytics: boolean;
      doNotShare: boolean;
      country?: string;
      timestamp: string;
      ip?: string;
      gdpr?: {
        necessary: boolean;
        marketing: boolean;
        personalization: boolean;
        analytics: boolean;
        lastUpdated: string;
        country: string;
      };
      ccpa?: {
        necessary: boolean;
        doNotShare: boolean;
        lastUpdated: string;
        country: string;
      };
    };
    timestamp: string;
  }
  


export async function POST(request: NextRequest) {
  try {
    // Verify authentication and get site ID from token
    const accessToken = await jwt.verifyAuth(request);
    if (!accessToken) {
      return withCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
    const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
    if (!siteId) {
      return withCORS(NextResponse.json({ 
        error: "Unauthorized",
        details: "SiteId not found"
      }, { status: 401 }));
    }
    
    const body = await request.json() as CookiePreferences;
    const { visitorId, preferences, timestamp } = body;

    if (!visitorId || !preferences || !timestamp) {
      return withCORS(NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      ));
    }

    // Get Cloudflare context
    const { env } = getCloudflareContext();
    if (!env) {
      return withCORS(NextResponse.json(
        { error: 'Cloudflare environment not available' },
        { status: 500 }
      ));
    }

    // Store preferences in KV with site-specific key
    const key = `cookie-preferences:${siteId}:${visitorId}`;
    await env.WEBFLOW_AUTHENTICATION.put(key, JSON.stringify({
      preferences,
      timestamp,
      lastUpdated: new Date().toISOString()
    }));

    return withCORS(NextResponse.json({ success: true }));
  } catch (error) {
    console.error('Error saving cookie preferences:', error);
    return withCORS(NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    ));
  }
}

export async function GET(request: NextRequest) {
    try {
      // Verify authentication and get site ID from token
      const accessToken = await jwt.verifyAuth(request);
      if (!accessToken) {
        return withCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      }
      const siteId = await jwt.getSiteIdFromAccessToken(accessToken);
      if (!siteId) {
        return withCORS(NextResponse.json({ 
          error: "Unauthorized",
          details: "SiteId not found"
        }, { status: 401 }));
      }
      
      const visitorId = request.nextUrl.searchParams.get('visitorId');
  
      if (!visitorId) {
        return withCORS(NextResponse.json(
          { error: 'Visitor ID is required' },
          { status: 400 }
        ));
      }
  
      // Get preferences from KV using site-specific key
      const key = `cookie-preferences:${siteId}:${visitorId}`;
      const { env } = getCloudflareContext();
      if (!env) {
        return withCORS(NextResponse.json(
          { error: 'Cloudflare environment not available' },
          { status: 500 }
        ));
      }
  
      // Get data from KV store
      const value = await env.WEBFLOW_AUTHENTICATION.get(key);
      
      if (!value) {
        return withCORS(NextResponse.json({
          success: false,
          message: 'No preferences found for this visitor',
          data: null
        }));
      }
  
      try {
        const data = JSON.parse(value) as CookiePreferences;
        return withCORS(NextResponse.json({
          success: true,
          message: 'Preferences retrieved successfully',
          data
        }));
      } catch (error) {
        console.error('Error parsing preferences:', error);
        return withCORS(NextResponse.json(
          { 
            success: false,
            error: 'Error parsing preferences',
            message: 'Failed to parse stored preferences'
          },
          { status: 500 }
        ));
      }
    } catch (error) {
      console.error('Error retrieving cookie preferences:', error);
      return withCORS(NextResponse.json(
        { 
          success: false,
          error: 'Failed to retrieve preferences',
          message: 'An unexpected error occurred'
        },
        { status: 500 }
      ));
    }
  } 