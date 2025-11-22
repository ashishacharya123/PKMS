/**
 * Shared file upload configuration
 * Centralized settings for file size limits, accepted types, and upload constraints
 * Used across FileUploadZone and FileUploadModal components
 */

export const FILE_UPLOAD_CONFIG = {
  /** Maximum file size in bytes (50MB) - matches backend limit */
  maxSize: 50 * 1024 * 1024,

  /** Maximum number of files allowed per upload */
  maxFiles: 10,

  /** Accepted MIME types for file upload
   *  These are used for browser-level filtering via the accept attribute
   *  Backend performs additional validation and security checks
   */
  acceptedTypes: [
    'image/*',                           // All image formats
    'application/pdf',                   // PDF documents
    'text/*',                            // Text files
    'application/msword',                // Word documents (.doc)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word (.docx)
    'application/vnd.ms-excel',          // Excel (.xls)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // Excel (.xlsx)
    'application/vnd.ms-powerpoint',     // PowerPoint (.ppt)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PowerPoint (.pptx)
    'application/zip',                   // ZIP archives
    'application/x-rar-compressed',      // RAR archives
    'application/x-7z-compressed',       // 7Z archives
    'application/vnd.ms-office',         // Microsoft Office formats
  ]
};

/** Human-readable file type descriptions for error messages */
export const HUMAN_READABLE_FILE_TYPES = {
  'image/*': 'Images',
  'application/pdf': 'PDF documents',
  'text/*': 'Text files',
  'application/msword': 'Word documents (.doc)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word documents (.docx)',
  'application/vnd.ms-excel': 'Excel spreadsheets (.xls)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel spreadsheets (.xlsx)',
  'application/vnd.ms-powerpoint': 'PowerPoint presentations (.ppt)',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint presentations (.pptx)',
  'application/zip': 'ZIP archives',
  'application/x-rar-compressed': 'RAR archives',
  'application/x-7z-compressed': '7Z archives',
  'application/vnd.ms-office': 'Microsoft Office files'
} as const;

/**
 * Convert MIME types to human-readable format for error messages
 * @param accept Array of MIME type strings
 * @returns Human-readable description of accepted file types
 */
export function getHumanReadableFileTypes(accept: string[]): string {
  return accept.map(mime => HUMAN_READABLE_FILE_TYPES[mime as keyof typeof HUMAN_READABLE_FILE_TYPES] || mime).join(', ');
}