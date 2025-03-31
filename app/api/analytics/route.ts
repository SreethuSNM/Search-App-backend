
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import withCORS from "../../lib/utils/cors";
import jwt from "../../lib/utils/jwt";



// Define interfaces
interface AnalyticsScript {
  src: string | null;
  content: string | null;
  type: string | null;
  async: boolean;
  defer: boolean;
}

interface AnalyticsResult {
  analyticsScripts: AnalyticsScript[];
  totalScripts: number;
  totalAnalyticsScripts: number;
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

 const { env } = await getCloudflareContext({ async: true });
 const storedAuth = await env.WEBFLOW_AUTHENTICATION.get(siteId)
 if (!storedAuth) {
  return withCORS(NextResponse.json(
    { success: false, error: "Unauthorized - No stored auth" }, 
    { status: 401 }
  ));
}
 const parsedData = JSON.parse(storedAuth)
  const siteUrl = `https://${parsedData.siteName}.webflow.io`


    if (!siteUrl || !siteId) {
      return withCORS(NextResponse.json(
        { success: false, error: "Missing siteUrl" }, 
        { status: 400 }
      ));
    }
 
  

    
    // Fetch the site content
    const response = await fetch(siteUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch site content: ${response.statusText}`);
    }

    const html = await response.text();

    // Improved script extraction regex
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
    const srcRegex = /src=["']([^"']+)["']/;
    const typeRegex = /type=["']([^"']+)["']/;
    const asyncRegex = /async/;
    const deferRegex = /defer/;

    const scripts: AnalyticsScript[] = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      const attributes = match[1];
      const content = match[2];
      
      const srcMatch = attributes.match(srcRegex);
      const typeMatch = attributes.match(typeRegex);
      const async = asyncRegex.test(attributes);
      const defer = deferRegex.test(attributes);

      // Only add if it's an analytics script
      const isAnalytics = (
        // Check src
   (srcMatch && (
    // Google Analytics & Tag Manager
    srcMatch[1].includes('google-analytics') ||
    srcMatch[1].includes('googletagmanager') ||
    srcMatch[1].includes('gtag') ||
    srcMatch[1].includes('_ga') ||
    srcMatch[1].includes('_gid') ||
    srcMatch[1].includes('_gat') ||
    srcMatch[1].includes('_gat_') ||
    
    // Facebook/Meta
    srcMatch[1].includes('facebook') ||
    srcMatch[1].includes('fbq') ||
    srcMatch[1].includes('_fbp') ||
    srcMatch[1].includes('_fbc') ||
    srcMatch[1].includes('fr') ||
    srcMatch[1].includes('tr') ||
    
    // LinkedIn
    srcMatch[1].includes('li_oatml') ||
    srcMatch[1].includes('li_sugr') ||
    srcMatch[1].includes('bcookie') ||
    
    // HubSpot
    srcMatch[1].includes('hubspot') ||
    srcMatch[1].includes('hubspotutk') ||
    srcMatch[1].includes('__hs_opt_out') ||
    srcMatch[1].includes('__hs_do_not_track') ||
    srcMatch[1].includes('__hs_initial_opt_in') ||
    srcMatch[1].includes('__hs_initial_opt_out') ||
    
    // Zoho
    srcMatch[1].includes('zoho') ||
    srcMatch[1].includes('zohocsrftoken') ||
    srcMatch[1].includes('zohosession') ||
    
    // Webflow
    srcMatch[1].includes('webflow') ||
    srcMatch[1].includes('wf_session') ||
    srcMatch[1].includes('wf_analytics') ||
    
    // General marketing patterns
    srcMatch[1].includes('ads') ||
    srcMatch[1].includes('advertising') ||
    srcMatch[1].includes('marketing') ||
    srcMatch[1].includes('tracking') ||
    srcMatch[1].includes('campaign') ||
    srcMatch[1].includes('cfz_facebook-pixel') ||
    srcMatch[1].includes('cfz_reddit') ||
    srcMatch[1].includes('_biz_flagsA') ||
    srcMatch[1].includes('_biz_nA') ||
    srcMatch[1].includes('_biz_pendingA') ||
    srcMatch[1].includes('_biz_uid') ||
    srcMatch[1].includes('_hp5_') ||
    srcMatch[1].includes('_mkto_trk') ||
    
    // Analytics patterns
    srcMatch[1].includes('analytics') ||
    srcMatch[1].includes('stats') ||
    srcMatch[1].includes('metrics') ||
    srcMatch[1].includes('AMCV_') ||
    srcMatch[1].includes('CF_VERIFIED_DEVICE') ||
    
    // Personalization patterns
    srcMatch[1].includes('optimizely') ||
    srcMatch[1].includes('pardot') ||
    srcMatch[1].includes('salesforce') ||
    srcMatch[1].includes('intercom') ||
    srcMatch[1].includes('drift') ||
    srcMatch[1].includes('zendesk') ||
    srcMatch[1].includes('freshchat') ||
    srcMatch[1].includes('tawk') ||
    srcMatch[1].includes('livechat') ||
    srcMatch[1].includes('olark') ||
    srcMatch[1].includes('purechat') ||
    srcMatch[1].includes('snapengage') ||
    srcMatch[1].includes('liveperson') ||
    srcMatch[1].includes('boldchat') ||
    srcMatch[1].includes('clickdesk') ||
    srcMatch[1].includes('userlike') ||
    srcMatch[1].includes('zopim') ||
    srcMatch[1].includes('crisp') ||
    
    // Additional tracking patterns
    srcMatch[1].includes('hotjar') ||
    srcMatch[1].includes('mouseflow') ||
    srcMatch[1].includes('fullstory') ||
    srcMatch[1].includes('logrocket') ||
    srcMatch[1].includes('mixpanel') ||
    srcMatch[1].includes('segment') ||
    srcMatch[1].includes('amplitude') ||
    srcMatch[1].includes('heap') ||
    srcMatch[1].includes('kissmetrics') ||
    srcMatch[1].includes('matomo') ||
    srcMatch[1].includes('piwik') ||
    srcMatch[1].includes('woopra') ||
    srcMatch[1].includes('crazyegg') ||
    srcMatch[1].includes('clicktale') ||
    srcMatch[1].includes('hubspot') ||
    srcMatch[1].includes('marketo') ||
    srcMatch[1].includes('pardot') ||
    srcMatch[1].includes('salesforce') ||
    srcMatch[1].includes('intercom') ||
    srcMatch[1].includes('drift') ||
    srcMatch[1].includes('zendesk') ||
    srcMatch[1].includes('freshchat') ||
    srcMatch[1].includes('tawk') ||
    srcMatch[1].includes('livechat') ||
    srcMatch[1].includes('olark') ||
    srcMatch[1].includes('purechat') ||
    srcMatch[1].includes('snapengage') ||
    srcMatch[1].includes('liveperson') ||
    srcMatch[1].includes('boldchat') ||
    srcMatch[1].includes('clickdesk') ||
    srcMatch[1].includes('userlike') ||
    srcMatch[1].includes('zopim') ||
    srcMatch[1].includes('crisp') ||
    srcMatch[1].includes('linkedin') ||
    srcMatch[1].includes('twitter') ||
    srcMatch[1].includes('pinterest') ||
    srcMatch[1].includes('tiktok') ||
    srcMatch[1].includes('snap') ||
    srcMatch[1].includes('reddit') ||
    srcMatch[1].includes('quora') ||
    srcMatch[1].includes('outbrain') ||
    srcMatch[1].includes('taboola') ||
    srcMatch[1].includes('sharethrough') ||
    srcMatch[1].includes('moat') ||
    srcMatch[1].includes('integral-marketing') ||
    srcMatch[1].includes('comscore') ||
    srcMatch[1].includes('nielsen') ||
    srcMatch[1].includes('quantcast') ||
    srcMatch[1].includes('adobe') ||
    srcMatch[1].includes('marketo') ||
    srcMatch[1].includes('hubspot') ||
    srcMatch[1].includes('salesforce') ||
    srcMatch[1].includes('pardot') ||
    srcMatch[1].includes('eloqua') ||
    srcMatch[1].includes('act-on') ||
    srcMatch[1].includes('mailchimp') ||
    srcMatch[1].includes('constantcontact') ||
    srcMatch[1].includes('sendgrid') ||
    srcMatch[1].includes('klaviyo') ||
    srcMatch[1].includes('braze') ||
    srcMatch[1].includes('iterable') ||
    srcMatch[1].includes('appsflyer') ||
    srcMatch[1].includes('adjust') ||
    srcMatch[1].includes('branch') ||
    srcMatch[1].includes('kochava') ||
    srcMatch[1].includes('singular') ||
    srcMatch[1].includes('tune') ||
    srcMatch[1].includes('attribution') ||
    srcMatch[1].includes('chartbeat') ||
    srcMatch[1].includes('parse.ly') ||
    srcMatch[1].includes('newrelic') ||
    srcMatch[1].includes('datadog') ||
    srcMatch[1].includes('sentry') ||
    srcMatch[1].includes('rollbar') ||
    srcMatch[1].includes('bugsnag') ||
    srcMatch[1].includes('raygun') ||
    srcMatch[1].includes('loggly') ||
    srcMatch[1].includes('splunk') ||
    srcMatch[1].includes('elastic') ||
    srcMatch[1].includes('dynatrace') ||
    srcMatch[1].includes('appoptics') ||
    srcMatch[1].includes('pingdom') ||
    srcMatch[1].includes('uptimerobot') ||
    srcMatch[1].includes('statuscake') ||
    srcMatch[1].includes('clarity') ||
    srcMatch[1].includes('clickagy') ||
    srcMatch[1].includes('yandex') ||
    srcMatch[1].includes('baidu')
  )) ||
  
        // Check content
        (content && (
          content.includes('hotjar') ||
          content.includes('fbq') ||
          content.includes('dataLayer') ||
          content.includes('gtag') ||
          content.includes('googletagmanager')
        ))
      );

      if (isAnalytics) {
        scripts.push({
          src: srcMatch ? srcMatch[1] : null,
          content: content.trim() || null,
          type: typeMatch ? typeMatch[1] : null,
          async,
          defer
        });
      }
    }

    // Log the results for debugging
    console.log('Found analytics scripts:', scripts.length);
    scripts.forEach(script => {
      console.log('Script:', {
        src: script.src,
        type: script.type,
        async: script.async,
        defer: script.defer,
        contentLength: script.content?.length
      });
    });

    const result: AnalyticsResult = {
      analyticsScripts: scripts,
      totalScripts: scripts.length,
      totalAnalyticsScripts: scripts.length
    };

    return withCORS(NextResponse.json({ 
      success: true,
      data: result
    }));

  } catch (error: unknown) {
    console.error("Error fetching analytics scripts:", error);
    return withCORS(NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch analytics scripts" 
      },
      { status: 500 }
    ));
  }
}