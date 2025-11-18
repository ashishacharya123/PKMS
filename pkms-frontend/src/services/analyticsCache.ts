/**
 * AnalyticsCache - Client-side caching for analytics API responses
 * 
 * PURPOSE:
 * ========
 * Reduces redundant API calls by caching analytics responses with TTL.
 * Improves performance and reduces server load.
 * 
 * FEATURES:
 * =========
 * - Time-based expiration (TTL)
 * - Automatic cache invalidation
 * - Memory-efficient storage
 * - Cache key generation from parameters
 * 
 * @author AI Agent
 * @date 2025-01-XX
 */

class AnalyticsCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL = 60000; // 1 minute in milliseconds

  /**
   * Set a value in the cache
   * @param key Cache key (should be unique per request parameters)
   * @param data Data to cache
   */
  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get a value from the cache if it exists and hasn't expired
   * @param key Cache key
   * @returns Cached data or null if not found/expired
   */
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific cache entry
   * @param key Cache key to remove
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Generate a cache key from analytics parameters
   * @param endpoint API endpoint name
   * @param params Request parameters
   * @returns Cache key string
   */
  static generateKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${endpoint}_${sortedParams}`;
  }
}

export const analyticsCache = new AnalyticsCache();
export { AnalyticsCache };

