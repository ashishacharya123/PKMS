/**
 * Smart Nepali date caching system with LRU eviction
 * Provides both sortable and display formats for efficient filtering and UI
 *
 * Uses custom nepaliDateConverter (2075-2090 BS ≈ 2018-2033 AD)
 * for accurate date conversions within the supported range.
 */

import { convertToNepali, type NepaliDateInfo as ConverterInfo } from './nepaliDateConverter';

// Re-export the interface from the converter
export type NepaliDateInfo = ConverterInfo;

class NepaliDateCache {
  private cache = new Map<string, NepaliDateInfo>();
  private readonly MAX_SIZE = 20; // LRU cache size - keeps most recent 20 conversions

  /**
   * Convert a Gregorian (English) date to Nepali date information with caching
   *
   * Uses custom nepaliDateConverter (2075-2090 BS ≈ 2018-2033 AD)
   * All conversions go through this cache for performance
   *
   * @param date - Date object or ISO string in English/Gregorian calendar
   * @returns NepaliDateInfo with both sortable and display formats
   * @throws Error if date conversion fails or date is outside supported range
   */
  convert(date: Date | string): NepaliDateInfo {
    // Normalize input to Date object
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // Create cache key from ISO date (YYYY-MM-DD format)
    // This ensures same date always uses same cache key regardless of time
    const key = dateObj.toISOString().split('T')[0];

    // Check cache first for performance
    if (this.cache.has(key)) {
      console.log('[NepaliDateCache] Cache hit for:', key);
      return this.cache.get(key)!;
    }

    try {
      console.log('[NepaliDateCache] Converting English date to Nepali:', {
        input: date,
        normalized: dateObj.toString(),
        english: `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`
      });

      // Use custom converter (supports 2075-2090 BS ≈ 2018-2033 AD)
      const info = convertToNepali(dateObj);

      console.log('[NepaliDateCache] ✅ Successfully converted:', {
        english: `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`,
        nepali: info.nepaliDate,
        display: info.nepaliDateDisplay
      });

      // Cache management: LRU (Least Recently Used) eviction
      // If cache is full, remove the oldest entry to make space
      if (this.cache.size >= this.MAX_SIZE) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          console.log('[NepaliDateCache] Cache full, evicting oldest entry:', oldestKey);
          this.cache.delete(oldestKey);
        }
      }

      // Store the new conversion result in cache
      this.cache.set(key, info);
      console.log('[NepaliDateCache] Cached new entry for:', key, 'Cache size:', this.cache.size);

      return info;
      } catch (error) {
      // Comprehensive error logging for debugging
      console.error('[NepaliDateCache] ❌ Date conversion failed:', {
        inputDate: dateObj.toString(),
        components: {
          year: dateObj.getFullYear(),
          month: dateObj.getMonth() + 1, // +1 for human-readable
          day: dateObj.getDate()
        },
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });

      // Re-throw error instead of returning fallback values
      // This ensures calling code knows conversion failed and can handle appropriately
      // Common failure reasons:
      // - Date outside supported range (2075BS-2090BS ≈ 2018-2033 AD)
      // - Invalid date input
      // - Converter calculation issues
      throw error;
    }
  }

  /**
   * Pre-cache frequently used dates for dashboard performance
   *
   * Strategy: Cache dates around today for immediate access
   * - Past 7 days: Commonly accessed historical data
   * - Today: Current date (most frequently accessed)
   * - Next 3 days: Upcoming dates for planning
   *
   * This eliminates conversion lag when users navigate recent dates
   * 
   * Smart caching: Only caches dates that aren't already cached
   */
  preCacheDashboard() {
    const today = new Date();
    const key = today.toISOString().split('T')[0];
    
    // Check if today is already cached - if so, likely all dates are cached
    if (this.cache.has(key)) {
      // All dates are likely already cached, skip pre-caching
      return;
    }

    console.log('[NepaliDateCache] 🚀 Pre-caching dashboard dates. Today is:', today.toDateString());

    let cachedCount = 0;
    let newCount = 0;

    // Cache date range: [-7, +3] days from today (total 11 dates)
    for (let i = -7; i <= 3; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      const dateKey = targetDate.toISOString().split('T')[0];

      // Only cache if not already cached
      if (!this.cache.has(dateKey)) {
        this.convert(targetDate);
        newCount++;
      } else {
        cachedCount++;
      }
    }

    if (newCount > 0) {
      console.log(`[NepaliDateCache] ✅ Pre-caching completed. Cached ${newCount} new dates, ${cachedCount} already cached. Cache size:`, this.cache.size);
    }
  }

  /**
   * Clear all cached entries
   *
   * Use cases:
   * - Testing: Reset cache state between test runs
   * - Memory management: Free memory if cache grows too large
   * - Debugging: Start fresh to isolate issues
   */
  clear() {
    const cacheSize = this.cache.size;
    this.cache.clear();
    console.log('[NepaliDateCache] 🧹 Cache cleared. Removed', cacheSize, 'entries');
  }

  /**
   * Get current cache size (for debugging and monitoring)
   *
   * Returns: Number of currently cached date conversions
   * Useful for: Performance monitoring, memory usage tracking
   */
  get size() {
    return this.cache.size;
  }
}

export const nepaliDateCache = new NepaliDateCache();
