/**
 * Service for extracting metadata from various file types
 * Supports PDFs, images, Office documents, and text files
 */

export interface ExtractedMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  author?: string;
  createdDate?: Date;
  modifiedDate?: Date;
  pageCount?: number;
  wordCount?: number;
  dimensions?: { width: number; height: number };
  location?: { latitude: number; longitude: number };
  language?: string;
  keywords?: string[];
  customProperties?: Record<string, any>;
}

export interface FileProcessingOptions {
  includeContentAnalysis?: boolean;
  includeOCR?: boolean;
  maxContentLength?: number;
  generateTags?: boolean;
}

/**
 * Main metadata extraction service
 */
class MetadataExtractionService {
  private supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/tiff'];
  private supportedDocumentTypes = ['application/pdf', 'text/plain', 'text/csv', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];

  /**
   * Extract metadata from a file
   */
  async extractMetadata(file: File, options: FileProcessingOptions = {}): Promise<ExtractedMetadata> {
    const {
      includeContentAnalysis = true,
      includeOCR = false,
      maxContentLength = 5000,
      generateTags = true
    } = options;

    const metadata: ExtractedMetadata = {};

    try {
      // Extract basic file properties
      Object.assign(metadata, this.extractBasicFileProperties(file));

      // Extract based on file type
      if (this.supportedImageTypes.includes(file.type)) {
        Object.assign(metadata, await this.extractImageMetadata(file));
      } else if (file.type === 'application/pdf') {
        Object.assign(metadata, await this.extractPDFMetadata(file, { includeContent: includeContentAnalysis }));
      } else if (file.type.startsWith('text/')) {
        Object.assign(metadata, await this.extractTextMetadata(file, {
          includeContent: includeContentAnalysis,
          maxLength: maxContentLength
        }));
      } else if (this.supportedDocumentTypes.includes(file.type)) {
        Object.assign(metadata, await this.extractOfficeMetadata(file));
      }

      // Generate smart tags if requested
      if (generateTags) {
        metadata.tags = this.generateTags(file, metadata);
      }

    } catch (error) {
      console.warn('Metadata extraction failed for file:', file.name, error);
    }

    return metadata;
  }

  /**
   * Extract basic file properties available for all files
   */
  private extractBasicFileProperties(file: File): Partial<ExtractedMetadata> {
    return {
      title: this.generateTitleFromFileName(file.name),
      createdDate: new Date(file.lastModified),
      modifiedDate: new Date(file.lastModified),
      customProperties: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        lastModified: file.lastModified
      }
    };
  }

  /**
   * Generate a clean title from filename
   */
  private generateTitleFromFileName(fileName: string): string {
    return fileName
      .replace(/\.[^/.]+$/, '') // Remove file extension
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Title case
      .trim();
  }

  /**
   * Extract metadata from image files
   */
  private async extractImageMetadata(file: File): Promise<Partial<ExtractedMetadata>> {
    const metadata: Partial<ExtractedMetadata> = {};

    try {
      // Create image element to extract dimensions
      const dimensions = await this.getImageDimensions(file);
      if (dimensions) {
        metadata.dimensions = dimensions;
      }

      // Extract EXIF data (simplified version)
      const exifData = await this.extractEXIFData(file);
      if (exifData) {
        Object.assign(metadata, exifData);
      }

    } catch (error) {
      console.warn('Image metadata extraction failed:', error);
    }

    return metadata;
  }

  /**
   * Get image dimensions
   */
  private getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
  }

  /**
   * Extract EXIF data from image (simplified implementation)
   */
  private async extractEXIFData(file: File): Promise<Partial<ExtractedMetadata>> {
    // This is a simplified implementation
    // In production, you'd use libraries like exifr or exif-js
    const metadata: Partial<ExtractedMetadata> = {};

    try {
      // Basic simulation - in real implementation, use EXIF library
      metadata.customProperties = {
        ...metadata.customProperties,
        colorSpace: 'RGB', // Placeholder
        hasAlpha: file.type === 'image/png' // Placeholder
      };

      // If GPS data was available, it would be extracted here
      // metadata.location = { latitude, longitude };

    } catch (error) {
      console.warn('EXIF extraction failed:', error);
    }

    return metadata;
  }

  /**
   * Extract metadata from PDF files
   */
  private async extractPDFMetadata(file: File, options: { includeContent?: boolean } = {}): Promise<Partial<ExtractedMetadata>> {
    const metadata: Partial<ExtractedMetadata> = {};

    try {
      // In production, use libraries like pdf-parse or pdfjs-dist
      // This is a simplified implementation

      if (options.includeContent) {
        // Simulate PDF content extraction
        const content = await this.extractPDFContent(file);
        if (content) {
          metadata.description = content.substring(0, 500);
          metadata.wordCount = content.split(/\s+/).length;
          metadata.pageCount = Math.ceil(content.length / 2000); // Rough estimate
        }
      }

      metadata.customProperties = {
        ...metadata.customProperties,
        isPDF: true,
        isEncrypted: false, // Would need actual PDF library to determine
        hasForms: false // Would need actual PDF library to determine
      };

    } catch (error) {
      console.warn('PDF metadata extraction failed:', error);
    }

    return metadata;
  }

  /**
   * Extract text content from PDF (simplified)
   */
  private async extractPDFContent(file: File): Promise<string | null> {
    // In production, use pdf-parse or similar library
    // This is a placeholder implementation
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        // This would require actual PDF parsing library
        resolve(`Sample PDF content from ${file.name}`);
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract metadata from text files
   */
  private async extractTextMetadata(file: File, options: { includeContent?: boolean; maxLength?: number }): Promise<Partial<ExtractedMetadata>> {
    const metadata: Partial<ExtractedMetadata> = {};

    try {
      if (options.includeContent) {
        const content = await this.extractTextContent(file, options.maxLength);
        if (content) {
          metadata.description = content.substring(0, 500);
          metadata.wordCount = content.split(/\s+/).length;
          metadata.language = this.detectLanguage(content);
          metadata.keywords = this.extractKeywords(content);
        }
      }

      metadata.customProperties = {
        ...metadata.customProperties,
        encoding: 'UTF-8', // Would need actual detection
        lineBreakStyle: '\n' // Would need actual detection
      };

    } catch (error) {
      console.warn('Text metadata extraction failed:', error);
    }

    return metadata;
  }

  /**
   * Extract text content from text files
   */
  private async extractTextContent(file: File, maxLength: number = 5000): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        resolve(content.length > maxLength ? content.substring(0, maxLength) + '...' : content);
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Extract metadata from Office documents
   */
  private async extractOfficeMetadata(file: File): Promise<Partial<ExtractedMetadata>> {
    const metadata: Partial<ExtractedMetadata> = {};

    try {
      // In production, use libraries like mammoth.js for Word docs, xlsx for Excel, etc.
      metadata.customProperties = {
        ...metadata.customProperties,
        isOfficeDocument: true,
        application: this.getOfficeApplication(file.type)
      };

      // Placeholder for actual Office document parsing
      if (file.type.includes('wordprocessingml')) {
        metadata.pageCount = 0; // Would need actual parsing
      }

    } catch (error) {
      console.warn('Office metadata extraction failed:', error);
    }

    return metadata;
  }

  /**
   * Get Office application based on MIME type
   */
  private getOfficeApplication(mimeType: string): string {
    if (mimeType.includes('wordprocessingml')) return 'Microsoft Word';
    if (mimeType.includes('spreadsheetml')) return 'Microsoft Excel';
    if (mimeType.includes('presentationml')) return 'Microsoft PowerPoint';
    if (mimeType.includes('msword')) return 'Microsoft Word';
    if (mimeType.includes('ms-excel')) return 'Microsoft Excel';
    if (mimeType.includes('ms-powerpoint')) return 'Microsoft PowerPoint';
    return 'Microsoft Office';
  }

  /**
   * Generate smart tags based on file and metadata
   */
  private generateTags(file: File, metadata: ExtractedMetadata): string[] {
    const tags: string[] = [];

    // File type tags
    if (this.supportedImageTypes.includes(file.type)) {
      tags.push('image', 'media');
      if (metadata.dimensions) {
        if (metadata.dimensions.width > 2000 || metadata.dimensions.height > 2000) {
          tags.push('high-resolution');
        }
        if (metadata.dimensions.width === metadata.dimensions.height) {
          tags.push('square');
        } else if (metadata.dimensions.width > metadata.dimensions.height) {
          tags.push('landscape');
        } else {
          tags.push('portrait');
        }
      }
    }

    if (file.type === 'application/pdf') {
      tags.push('pdf', 'document');
      if (metadata.pageCount && metadata.pageCount > 10) {
        tags.push('long-document');
      }
    }

    if (file.type.startsWith('text/')) {
      tags.push('text', 'document');
      if (metadata.wordCount) {
        if (metadata.wordCount > 5000) tags.push('long-content');
        if (metadata.wordCount < 500) tags.push('short-content');
      }
    }

    // Date-based tags
    if (metadata.createdDate) {
      const now = new Date();
      const daysDiff = (now.getTime() - metadata.createdDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 7) tags.push('recent');
      if (daysDiff > 365) tags.push('archived');
    }

    // Size-based tags
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 10) tags.push('large-file');
    if (sizeMB < 0.1) tags.push('small-file');

    // Content-based tags
    if (metadata.keywords) {
      tags.push(...metadata.keywords.slice(0, 3)); // Add top 3 keywords
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Detect language from text content
   */
  private detectLanguage(text: string): string {
    // Simple language detection based on character patterns
    const englishPattern = /^[a-zA-Z\s.,!?'"()-]+$/;
    const nepaliPattern = /[\u0900-\u097F]/;

    if (nepaliPattern.test(text)) {
      return 'ne';
    } else if (englishPattern.test(text.substring(0, 1000))) {
      return 'en';
    }

    return 'unknown';
  }

  /**
   * Extract keywords from text content
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production, use NLP libraries
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    // Count word frequencies
    const frequencies = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Return top 5 most frequent words
    return Object.entries(frequencies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'shall'];
    return stopWords.includes(word);
  }

  /**
   * Check if file type is supported for metadata extraction
   */
  isFileTypeSupported(file: File): boolean {
    return this.supportedImageTypes.includes(file.type) ||
           this.supportedDocumentTypes.includes(file.type) ||
           file.type.startsWith('text/');
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes(): string[] {
    return [
      ...this.supportedImageTypes,
      ...this.supportedDocumentTypes,
      'text/plain',
      'text/csv',
      'text/markdown',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'application/xml'
    ];
  }
}

// Export singleton instance
export const metadataExtractionService = new MetadataExtractionService();

// Export type utilities
export type { ExtractedMetadata, FileProcessingOptions };