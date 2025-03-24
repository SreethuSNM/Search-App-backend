/* eslint-disable @typescript-eslint/no-explicit-any */

export class CacheService {
    private static instance: CacheService;
    private cache: Map<string, { data: any; timestamp: number }>;
    private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
    private constructor() {
      this.cache = new Map();
    }
  
    static getInstance(): CacheService {
      if (!CacheService.instance) {
        CacheService.instance = new CacheService();
      }
      return CacheService.instance;
    }
  
    get(key: string) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }
      return null;
    }
  
    set(key: string, data: any) {
      this.cache.set(key, { data, timestamp: Date.now() });
    }
  
    clear() {
      this.cache.clear();
    }
  }
  