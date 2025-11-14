/**
 * Hook for using metadata extraction service with files
 * Provides reactive state for extracted metadata
 */

import { useState, useCallback } from 'react';
import { metadataExtractionService, ExtractedMetadata, FileProcessingOptions } from '../services/metadataExtractionService';

export interface UseMetadataExtractionOptions {
  autoExtract?: boolean;
  processingOptions?: FileProcessingOptions;
  onExtracted?: (file: File, metadata: ExtractedMetadata) => void;
  onError?: (file: File, error: Error) => void;
}

export interface ExtractionState {
  metadata: ExtractedMetadata | null;
  loading: boolean;
  error: string | null;
}

export function useMetadataExtraction(options: UseMetadataExtractionOptions = {}) {
  const {
    autoExtract = true,
    processingOptions = { includeContentAnalysis: true, generateTags: true },
    onExtracted,
    onError
  } = options;

  const [extractionStates, setExtractionStates] = useState<Map<string, ExtractionState>>(new Map());

  const getStateKey = (file: File): string => `${file.name}-${file.size}-${file.lastModified}`;

  const getExtractionState = (file: File): ExtractionState => {
    const key = getStateKey(file);
    return extractionStates.get(key) || { metadata: null, loading: false, error: null };
  };

  const updateExtractionState = useCallback((key: string, updates: Partial<ExtractionState>) => {
    setExtractionStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(key) || { metadata: null, loading: false, error: null };
      newMap.set(key, { ...current, ...updates });
      return newMap;
    });
  }, []);

  const extractMetadata = useCallback(async (file: File): Promise<ExtractedMetadata | null> => {
    const key = getStateKey(file);

    // Check if already extracted
    const existingState = extractionStates.get(key);
    if (existingState?.metadata) {
      return existingState.metadata;
    }

    // Set loading state
    updateExtractionState(key, { loading: true, error: null });

    try {
      const metadata = await metadataExtractionService.extractMetadata(file, processingOptions);

      updateExtractionState(key, {
        metadata,
        loading: false,
        error: null
      });

      onExtracted?.(file, metadata);
      return metadata;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      updateExtractionState(key, {
        loading: false,
        error: errorMessage
      });

      onError?.(file, error instanceof Error ? error : new Error(errorMessage));
      return null;
    }
  }, [extractionStates, processingOptions, updateExtractionState, onExtracted, onError]);

  const extractBatchMetadata = useCallback(async (files: File[]): Promise<Map<File, ExtractedMetadata | null>> => {
    const results = new Map<File, ExtractedMetadata | null>();

    // Extract in parallel for better performance
    const promises = files.map(async (file) => {
      const metadata = await extractMetadata(file);
      results.set(file, metadata);
    });

    await Promise.all(promises);
    return results;
  }, [extractMetadata]);

  const clearMetadata = useCallback((file?: File) => {
    if (file) {
      const key = getStateKey(file);
      setExtractionStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
    } else {
      setExtractionStates(new Map());
    }
  }, []);

  const getProcessedFilesCount = useCallback((): { processed: number; total: number; loading: number } => {
    let processed = 0;
    let loading = 0;
    let total = extractionStates.size;

    extractionStates.forEach(state => {
      if (state.metadata) processed++;
      if (state.loading) loading++;
    });

    return { processed, total, loading };
  }, [extractionStates]);

  const isFileProcessed = useCallback((file: File): boolean => {
    const state = getExtractionState(file);
    return state.metadata !== null;
  }, [extractionStates]);

  const isFileLoading = useCallback((file: File): boolean => {
    const state = getExtractionState(file);
    return state.loading;
  }, [extractionStates]);

  const getFileError = useCallback((file: File): string | null => {
    const state = getExtractionState(file);
    return state.error;
  }, [extractionStates]);

  // Auto-extract for new files if enabled
  const processFiles = useCallback(async (files: File[]): Promise<void> => {
    if (!autoExtract || files.length === 0) return;

    // Filter out already processed files
    const filesToProcess = files.filter(file => !isFileProcessed(file));
    if (filesToProcess.length === 0) return;

    await extractBatchMetadata(filesToProcess);
  }, [autoExtract, isFileProcessed, extractBatchMetadata]);

  return {
    // Core extraction methods
    extractMetadata,
    extractBatchMetadata,
    processFiles,

    // State getters
    getExtractionState,
    isFileProcessed,
    isFileLoading,
    getFileError,

    // Utility methods
    clearMetadata,
    getProcessedFilesCount,

    // Raw state access
    extractionStates
  };
}