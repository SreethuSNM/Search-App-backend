export class WebflowRateLimiter {
    private static instance: WebflowRateLimiter;
    private BATCH_SIZE = 3;
    private DELAY_BETWEEN_BATCHES = 1000; // 1 second
  
    private constructor() {}
  
    static getInstance(): WebflowRateLimiter {
      if (!WebflowRateLimiter.instance) {
        WebflowRateLimiter.instance = new WebflowRateLimiter();
      }
      return WebflowRateLimiter.instance;
    }
  
    async processBatch<T>(
      items: string[],
      processor: (item: string) => Promise<T>
    ): Promise<Map<string, T>> {
      const results = new Map<string, T>();
  
      for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
        const batch = items.slice(i, i + this.BATCH_SIZE);
  
        await Promise.all(
          batch.map(async (item) => {
            try {
              const result = await processor(item);
              results.set(item, result);
            } catch (error) {
              console.error(`Error processing item ${item}:`, error);
              results.set(item, {} as T);
            }
          })
        );
  
        if (i + this.BATCH_SIZE < items.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.DELAY_BETWEEN_BATCHES)
          );
        }
      }
  
      return results;
    }
  }
  