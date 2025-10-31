/**
 * Custom React Hooks for PKMS
 *
 * Provides standardized data loading, error handling, form management,
 * and modal management across all components.
 */

export { useDataLoader } from './useDataLoader';
export { useErrorHandler } from './useErrorHandler';
export { useForm } from './useForm';
export { useModal } from './useModal';

export type { DataLoaderOptions } from './useDataLoader';
export type { ErrorHandlerOptions } from './useErrorHandler';
export type { FormOptions } from './useForm';
export type { ModalOptions } from './useModal';

// Re-export existing hooks for convenience
export { useAuthenticatedEffect } from './useAuthenticatedEffect';
export { useAuthenticatedApi } from './useAuthenticatedApi';
export { useViewPreferences } from './useViewPreferences';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useGlobalKeyboardShortcuts } from './useGlobalKeyboardShortcuts';
export { useDragAndDrop } from './useDragAndDrop';
export { useDateTime } from './useDateTime';