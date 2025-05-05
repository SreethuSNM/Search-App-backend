import { WebflowClient } from "webflow-api";
import { CacheService } from "../services/CacheService";
import { WebflowRateLimiter } from "../services/WebflowRateLimiter";
import crypto from "crypto";
import {
 
  
} from "webflow-api/api/resources/scripts";

interface WebflowError {
  statusCode?: number;
  message?: string;
}


function isWebflowError(error: unknown): error is WebflowError {
  return typeof error === "object" && error !== null && "statusCode" in error;
}

export class ScriptController {
  private webflow: WebflowClient;
  private cache: CacheService;
  private rateLimiter: WebflowRateLimiter;

  constructor(webflow: WebflowClient) {
    this.webflow = webflow;
    this.cache = CacheService.getInstance();
    this.rateLimiter = WebflowRateLimiter.getInstance();
  }

  public updateWebflowClient(webflow: WebflowClient) {
    this.webflow = webflow;
  }

  // Script Registration Methods
  async getRegisteredScripts(siteId: string) {
    try {
      const data = await this.webflow.scripts.list(siteId);
      return data.registeredScripts;
    } catch (error) {
      console.error("Error fetching scripts:", error);
      throw error;
    }
  }

  async registerInlineScript(siteId: string) {
    const sourceCode= "console.log('Hello');"
    try {
      const scriptData = {
        sourceCode: sourceCode,
        canCopy:  true,
          version: "1.0.0",
        displayName: "searchScript",
      };
      return await this.webflow.scripts.registerInline(siteId, scriptData);
    } catch (error) {
      console.error("Error registering inline script:", error);
      throw error;
    }
  }

  
  // async registerHostedScripts(siteId: string) {
  //   try {
  //     console.log("Siteid in hosted script",siteId)
     
  //     const hostedLocation ="";
      
  //      const integrityHash = await this.generateSRI(hostedLocation);

  //     const scriptData = {
  //      // hostedLocation: request.hostedLocation,
  //       hostedLocation: hostedLocation,
  //       integrityHash: integrityHash,
  //       canCopy:  true,
  //       version: "1.0.0",
  //       displayName: `ConsentScript2025${Date.now()}`,
  //     };
  //     console.log("scriptData",scriptData)
  //     return await this.webflow.scripts.registerHosted(siteId, scriptData);
  //   } catch (error) {
  //     console.error("Error registering hosted script:", error);
  //     throw error;
  //   }
  // }


  // Site-level Methods
  async getSiteCustomCode(siteId: string) {
    console.log("Using Access Token inside getSiteCustomCode:", this.webflow);

    const cacheKey = `site_${siteId}`;
    console.log(cacheKey);
    
    const cached = this.cache.get(cacheKey);
    console.log(cached);
    
    if (cached) return cached;

    try {
      console.log("inside try");
      
        const result = await this.webflow.sites.scripts.getCustomCode(siteId);
        console.log("this is the result" , result);
        
        this.cache.set(cacheKey, result);
        return result;      
    } catch (error) {
        console.error("Error fetching site custom code:", error);
        throw error;
    }
}

  async upsertSiteCustomCode(
    siteId: string,
    scriptId: string,
    location: "header" | "footer",
    version: string
  ) {
    try {
      let existingScripts = await this.getExistingScripts("site", siteId);
      console.log(
        "[DEBUG] upsertSiteCustomCode existing scripts:",
        existingScripts
      );

      // Remove any existing entries for this script ID to avoid duplicates
      existingScripts = existingScripts.filter(
        (script: { id: string }) => script.id !== scriptId
      );
      console.log(
        "[DEBUG] upsertSiteCustomCode after filter:",
        existingScripts
      );

      // Add the new script configuration
      existingScripts.push({ id: scriptId, location, version });
      console.log(
        "[DEBUG] upsertSiteCustomCode final scripts array:",
        existingScripts
      );

      // Ensure we're sending the correct structure
      return await this.webflow.sites.scripts.upsertCustomCode(siteId, {
        scripts: existingScripts,
      });
    } catch (error) {
      console.error("Error upserting site custom code:", error);
      throw error;
    }
  }

  async deleteSiteCustomCode(siteId: string) {
    try {
      const result = await this.webflow.sites.scripts.deleteCustomCode(siteId);
      this.cache.set(`site_${siteId}`, null);
      return result;
    } catch (error) {
      console.error("Error deleting site custom code:", error);
      throw error;
    }
  }

  // Page-level Methods
  async getPageCustomCode(pageId: string) {
    const cacheKey = `page_${pageId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.webflow.pages.scripts.getCustomCode(pageId);
      const result = response.scripts || [];
      this.cache.set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      if (isWebflowError(error) && error.statusCode !== 404) throw error;
      return [];
    }
  }

  async getMultiplePageCustomCode(pageIds: string[]) {
    const results = new Map();
    const uncachedPageIds = [];

    // First check cache for all pages
    for (const pageId of pageIds) {
      const cacheKey = `page_${pageId}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        results.set(pageId, cached);
      } else {
        uncachedPageIds.push(pageId);
      }
    }

    // Only make API calls for uncached pages
    if (uncachedPageIds.length > 0) {
      const batchResults = await this.rateLimiter.processBatch(
        uncachedPageIds,
        async (pageId) => {
          try {
            const response = await this.webflow.pages.scripts.getCustomCode(
              pageId
            );
            const pageScripts = response.scripts || [];
            // Cache the result
            this.cache.set(`page_${pageId}`, pageScripts);
            return pageScripts;
          } catch (error: unknown) {
            if (isWebflowError(error) && error.statusCode !== 404) throw error;
            return [];
          }
        }
      );

      // Add batch results to the final results
      for (const [pageId, scripts] of batchResults) {
        results.set(pageId, scripts);
      }
    }

    return results;
  }

  async upsertPageCustomCode(
    pageId: string,
    scriptId: string,
    location: "header" | "footer",
    version: string
  ) {
    try {
      let existingScripts = await this.getExistingScripts("page", pageId);
      // Remove any existing entries for this script ID to avoid duplicates
      existingScripts = existingScripts.filter(
        (script: { id: string }) => script.id !== scriptId
      );
      // Add the new script configuration
      existingScripts.push({ id: scriptId, location, version });
      return await this.webflow.pages.scripts.upsertCustomCode(pageId, {
        scripts: existingScripts,
      });
    } catch (error) {
      console.error("Error upserting page custom code:", error);
      throw error;
    }
  }

  async deletePageCustomCode(pageId: string) {
    try {
      const result = await this.webflow.pages.scripts.deleteCustomCode(pageId);
      this.cache.set(`page_${pageId}`, null);
      return result;
    } catch (error) {
      console.error("Error deleting page custom code:", error);
      throw error;
    }
  }

  // Helper Methods
  private async generateSRI(url: string): Promise<string> {
    const response = await fetch(url);
    const data = await response.text();
    const hash = crypto.createHash("sha384").update(data).digest("base64");
    return `sha384-${hash}`;
  }

  private async getExistingScripts(type: "site" | "page", id: string) {
    try {
      const getter =
        type === "site" ? this.getSiteCustomCode : this.getPageCustomCode;
      const response = await getter.call(this, id);
      console.log(
        `[DEBUG] getExistingScripts raw response for ${type}:`,
        response
      );

      const scripts = type === "site" ? response.scripts || [] : response || [];
      console.log(
        `[DEBUG] getExistingScripts processed scripts for ${type}:`,
        scripts
      );
      return scripts;
    } catch (error: unknown) {
      console.error(`[DEBUG] getExistingScripts error for ${type}:`, error);
      if (isWebflowError(error) && error.statusCode !== 404) throw error;
      return [];
    }
  }
}
