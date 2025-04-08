import { getCloudflareContext } from "@opennextjs/cloudflare";




interface SiteDetails {
  accessToken: string;
  siteName: string;
  siteId: string;
}

export default async function findSiteDetails(siteName: string): Promise<SiteDetails | null> {
    try {
        const { env } = await getCloudflareContext({ async: true });
        const keys = await env.WEBFLOW_AUTHENTICATION.list();
        console.log("siteName",siteName)
        console.log("ev keys",keys)
        
        for (const key of keys.keys) {
            const value = await env.WEBFLOW_AUTHENTICATION.get(key.name);
            if (value) {
                const siteDetails: SiteDetails = JSON.parse(value);
                if (siteDetails.siteName === siteName) {
                    return {
                        ...siteDetails,
                        siteId: key.name
                    };
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Error finding site details:', error);
        return null;
    }
}