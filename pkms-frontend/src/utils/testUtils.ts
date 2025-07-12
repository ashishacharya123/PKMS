/**
 * Frontend Test Utilities for PKMS
 * 
 * Provides debugging and testing utilities for authentication, API connectivity,
 * and race condition detection in the browser environment.
 */

import { API_BASE_URL } from '../config';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  timestamp: string;
}

export interface AuthTestResults {
  tokenExists: TestResult;
  tokenValid: TestResult;
  apiConnectivity: TestResult;
  authFlow: TestResult;
  raceCondition: TestResult;
}

/**
 * Decode JWT token payload for inspection
 */
export function decodeJWTToken(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format - must have 3 parts');
    }

    // Decode payload (add padding if needed)
    const payload = parts[1];
    const paddedPayload = payload + '='.repeat(4 - (payload.length % 4));
    const decoded = atob(paddedPayload);
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJWTToken(token);
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch {
    return true; // Treat invalid tokens as expired
  }
}

/**
 * Test if token exists in localStorage
 */
export function testTokenExists(): TestResult {
  const timestamp = new Date().toISOString();
  const token = localStorage.getItem('pkms_token');
  
  if (!token) {
    return {
      success: false,
      message: 'No JWT token found in localStorage',
      details: { key: 'pkms_token', value: null },
      timestamp
    };
  }

  return {
    success: true,
    message: 'JWT token found in localStorage',
    details: { 
      key: 'pkms_token', 
      length: token.length,
      preview: token.substring(0, 20) + '...'
    },
    timestamp
  };
}

/**
 * Test if token is valid and not expired
 */
export function testTokenValid(): TestResult {
  const timestamp = new Date().toISOString();
  const token = localStorage.getItem('pkms_token');
  
  if (!token) {
    return {
      success: false,
      message: 'No token to validate',
      timestamp
    };
  }

  try {
    const payload = decodeJWTToken(token);
    const isExpired = isTokenExpired(token);
    const expiryDate = new Date(payload.exp * 1000);
    
    if (isExpired) {
      return {
        success: false,
        message: 'Token is expired',
        details: {
          userId: payload.sub,
          expiryDate: expiryDate.toISOString(),
          expired: true
        },
        timestamp
      };
    }

    return {
      success: true,
      message: 'Token is valid and not expired',
      details: {
        userId: payload.sub,
        expiryDate: expiryDate.toISOString(),
        timeUntilExpiry: Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60) + ' minutes',
        expired: false
      },
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      message: 'Token is malformed',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp
    };
  }
}

/**
 * Test API connectivity to backend
 */
export async function testAPIConnectivity(): Promise<TestResult> {
  const timestamp = new Date().toISOString();
  
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Backend health check failed with status ${response.status}`,
        details: { status: response.status, statusText: response.statusText },
        timestamp
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: 'Backend API is reachable and healthy',
      details: data,
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to connect to backend API',
      details: { 
        error: error instanceof Error ? error.message : 'Unknown error',
        likely_cause: 'Backend server not running or CORS issues'
      },
      timestamp
    };
  }
}

/**
 * Test authentication flow with explicit headers
 */
export async function testAuthFlow(): Promise<TestResult> {
  const timestamp = new Date().toISOString();
  const token = localStorage.getItem('pkms_token');
  
  if (!token) {
    return {
      success: false,
      message: 'No token available for auth flow test',
      timestamp
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 403) {
      return {
        success: false,
        message: 'Authentication failed - 403 Forbidden',
        details: { 
          status: 403,
          likely_cause: 'Token not being sent properly or backend auth issue'
        },
        timestamp
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        message: 'Authentication failed - 401 Unauthorized',
        details: { 
          status: 401,
          likely_cause: 'Token expired, invalid, or malformed'
        },
        timestamp
      };
    }

    if (!response.ok) {
      return {
        success: false,
        message: `Auth flow failed with status ${response.status}`,
        details: { status: response.status, statusText: response.statusText },
        timestamp
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: 'Authentication flow working correctly',
      details: { user: data.username, userId: data.id },
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      message: 'Auth flow test failed with network error',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp
    };
  }
}

/**
 * Test for race condition by making rapid successive API calls
 */
export async function testRaceCondition(): Promise<TestResult> {
  const timestamp = new Date().toISOString();
  const token = localStorage.getItem('pkms_token');
  
  if (!token) {
    return {
      success: false,
      message: 'No token available for race condition test',
      timestamp
    };
  }

  const endpoints = [
    '/api/v1/auth/me',
    '/api/v1/notes/',
    '/api/v1/documents/',
    '/api/v1/todos/',
    '/api/v1/dashboard/stats'
  ];

  try {
    // Make rapid successive requests
    const promises = endpoints.map(endpoint => 
      fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    );

    const responses = await Promise.all(promises);
    const results = responses.map((response, index) => ({
      endpoint: endpoints[index],
      status: response.status,
      success: response.status !== 403 // No authentication errors
    }));

    const authErrors = results.filter(r => r.status === 403);
    
    if (authErrors.length > 0) {
      return {
        success: false,
        message: `Race condition detected - ${authErrors.length} endpoints returned 403`,
        details: { 
          failed_endpoints: authErrors,
          all_results: results
        },
        timestamp
      };
    }

    return {
      success: true,
      message: 'No race condition detected - all requests authenticated properly',
      details: { results },
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      message: 'Race condition test failed with network error',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp
    };
  }
}

/**
 * Run comprehensive authentication tests
 */
export async function runAuthenticationTests(): Promise<AuthTestResults> {
  console.log('🔍 Running PKMS Authentication Tests...');
  
  const results: AuthTestResults = {
    tokenExists: testTokenExists(),
    tokenValid: testTokenValid(),
    apiConnectivity: await testAPIConnectivity(),
    authFlow: await testAuthFlow(),
    raceCondition: await testRaceCondition()
  };

  // Log results to console for debugging
  console.log('='.repeat(50));
  console.log('📊 Authentication Test Results:');
  console.log('='.repeat(50));
  
  Object.entries(results).forEach(([testName, result]) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${testName}: ${result.message}`);
    if (result.details) {
      console.log('   Details:', result.details);
    }
  });

  console.log('='.repeat(50));
  
  const passedTests = Object.values(results).filter(r => r.success).length;
  const totalTests = Object.values(results).length;
  console.log(`📈 Summary: ${passedTests}/${totalTests} tests passed`);

  return results;
}

/**
 * Quick authentication status check
 */
export function quickAuthCheck(): { authenticated: boolean; issues: string[] } {
  const issues: string[] = [];
  
  const token = localStorage.getItem('pkms_token');
  if (!token) {
    issues.push('No authentication token found');
    return { authenticated: false, issues };
  }

  try {
    if (isTokenExpired(token)) {
      issues.push('Authentication token is expired');
      return { authenticated: false, issues };
    }
  } catch (error) {
    issues.push('Authentication token is malformed');
    return { authenticated: false, issues };
  }

  return { authenticated: true, issues };
}

/**
 * Clear all authentication data (for testing logout scenarios)
 */
export function clearAuthData(): void {
  localStorage.removeItem('pkms_token');
  localStorage.removeItem('pkms_user');
  sessionStorage.clear();
  console.log('🧹 Cleared all authentication data');
}

/**
 * Generate a test report for debugging
 */
export async function generateTestReport(): Promise<string> {
  const results = await runAuthenticationTests();
  const timestamp = new Date().toISOString();
  
  let report = `PKMS Authentication Test Report\n`;
  report += `Generated: ${timestamp}\n`;
  report += `=`.repeat(50) + '\n\n';
  
  Object.entries(results).forEach(([testName, result]) => {
    report += `${testName.toUpperCase()}:\n`;
    report += `  Status: ${result.success ? 'PASS' : 'FAIL'}\n`;
    report += `  Message: ${result.message}\n`;
    if (result.details) {
      report += `  Details: ${JSON.stringify(result.details, null, 2)}\n`;
    }
    report += '\n';
  });
  
  const passedTests = Object.values(results).filter(r => r.success).length;
  const totalTests = Object.values(results).length;
  report += `SUMMARY: ${passedTests}/${totalTests} tests passed\n`;
  
  return report;
} 