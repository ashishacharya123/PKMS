import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';

/**
 * Custom hook that ensures useEffect only runs after authentication is established
 * Prevents race conditions where API calls are made before auth is ready
 */
export function useAuthenticatedEffect(
  effect: () => void | (() => void),
  deps: React.DependencyList = []
) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasRunRef = useRef(false);
  const cleanupRef = useRef<(() => void) | void>();

  useEffect(() => {
    // Don't run if still loading auth or not authenticated
    if (isLoading || !isAuthenticated) {
      return;
    }

    // Run the effect only once authentication is confirmed
    if (!hasRunRef.current) {
      hasRunRef.current = true;
      cleanupRef.current = effect();
    }

    // Cleanup function
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
    };
  }, [isAuthenticated, isLoading, ...deps]);

  // Reset when authentication state changes
  useEffect(() => {
    if (!isAuthenticated) {
      hasRunRef.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
    }
  }, [isAuthenticated]);
}

/**
 * Hook for effects that should run on every dependency change after auth
 */
export function useAuthenticatedEffectAlways(
  effect: () => void | (() => void),
  deps: React.DependencyList = []
) {
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // Don't run if still loading auth or not authenticated
    if (isLoading || !isAuthenticated) {
      return;
    }

    // Run the effect every time deps change (after auth is ready)
    return effect();
  }, [isAuthenticated, isLoading, ...deps]);
}