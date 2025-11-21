/**
 * Cookie utilities for iframe authentication
 */

/**
 * Get the value of a specific cookie by name
 * @param name - Cookie name
 * @returns Cookie value or null if not found
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null; // Server-side rendering
  }

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift();
    return cookieValue || null;
  }

  return null;
}

/**
 * Get the current authentication token for iframe usage
 * @returns The pkms_access_token value or null if not found
 */
export function getCurrentAuthToken(): string | null {
  const token = getCookie('pkms_access_token'); // Use the non-HttpOnly access token
  console.log('🔍 DEBUG: Access token found:', token ? `${token.substring(0, 20)}...` : 'null');
  return token;
}

/**
 * Add authentication token to a URL for iframe usage
 * @param url - Original URL
 * @param token - Authentication token (optional, will auto-detect if not provided)
 * @returns URL with token parameter added
 */
export function addTokenToUrl(url: string, token?: string): string {
  const authToken = token || getCurrentAuthToken();

  console.log('🔍 DEBUG: addTokenToUrl called with:', { url, hasProvidedToken: !!token });

  if (!authToken) {
    console.log('🔍 DEBUG: No token available, returning original URL');
    return url; // No token available
  }

  // Ensure URL has proper query parameter format
  const separator = url.includes('?') ? '&' : '?';
  const urlWithToken = `${url}${separator}token=${encodeURIComponent(authToken)}`;
  console.log('🔍 DEBUG: URL with token:', urlWithToken.substring(0, 100) + '...');
  return urlWithToken;
}