import { getCloudflareContext } from "@opennextjs/cloudflare";

interface SiteDetails {
  accessToken: string;
  siteName: string;      // This is the shortName from Webflow
  fullDomainName: string; // This is the full domain (custom or webflow.io)
  // siteId is not part of the stored object, it's the key for this object.
}

export default async function findSiteDetails(siteNameInput: string): Promise<(SiteDetails & { siteId: string }) | null> {
    try {
        console.log("sitenme:",siteNameInput);
        const { env } = await getCloudflareContext({ async: true });
        if (!env?.WEBFLOW_AUTHENTICATION) {
            console.error("KV binding WEBFLOW_AUTHENTICATION missing in findSiteDetails");
            return null;
        }

        // siteNameInput could be the shortName or the fullDomainName
        // Let's first try to get the site ID using the siteNameInput as if it's the shortName
        const siteIdKey = `site-name:${siteNameInput}`;
        const siteId = await env.WEBFLOW_AUTHENTICATION.get(siteIdKey);

        if (siteId) {
            // If we found a siteId, now fetch the main SiteDetails object using this siteId as the key
            const siteDetailsJson = await env.WEBFLOW_AUTHENTICATION.get(siteId);
            if (siteDetailsJson) {
                try {
                    const parsedDetails = JSON.parse(siteDetailsJson) as SiteDetails;
                    // Validate if the retrieved details actually match the input, 
                    // especially if siteNameInput could have been a full domain.
                    if (parsedDetails.siteName === siteNameInput || parsedDetails.fullDomainName === siteNameInput) {
                         return { ...parsedDetails, siteId: siteId }; // Add the siteId to the returned object
                    }
                } catch (e) {
                    console.error(`Failed to parse SiteDetails JSON for siteId '${siteId}' (obtained from key '${siteIdKey}'). Value: ${siteDetailsJson}`, e);
                    return null;
                }
            }
        } 
        
      

        console.warn(`findSiteDetails: No site found for siteNameInput '${siteNameInput}' using direct lookup.`);
      
        return null;

    } catch (error) {
        console.error('Error in findSiteDetails for input ', siteNameInput, error);
        return null;
    }
}