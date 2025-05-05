import { getCloudflareContext } from "@opennextjs/cloudflare";

interface Collection {
  id: string;
  displayName: string;
  slug: string;
  // Add any other fields as needed
}

export default async function getCollectionsBySiteId(siteId: string): Promise<Collection[] | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const stored = await env.WEBFLOW_AUTHENTICATION.get(siteId);
    if (!stored) {
      console.error(`No token found for siteId: ${siteId}`);
      return null;
    }

    const { accessToken } = JSON.parse(stored);

    const response = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Failed to fetch collections:", err);
      return null;
    }

    const data = await response.json() as { collections: Collection[] };
    return data.collections; // Webflow returns { collections: [...] }
  } catch (error) {
    console.error("Error fetching collections:", error);
    return null;
  }
}
