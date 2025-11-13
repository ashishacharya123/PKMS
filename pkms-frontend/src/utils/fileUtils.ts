/**
 * Utility functions for file operations
 */

/**
 * Format file size in bytes to human-readable string
 * @param bytes - File size in bytes (can be undefined/null/invalid)
 * @returns Formatted string like "1.5 KB" or "N/A" for invalid values
 */
export const formatFileSize = (bytes: number | undefined): string => {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return 'N/A';
  }
  if (bytes === 0) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const clampedIndex = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(1024, clampedIndex)).toFixed(1)} ${sizes[clampedIndex]}`;
};