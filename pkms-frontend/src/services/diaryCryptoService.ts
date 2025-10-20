/**
 * Diary Crypto Service (Client-Side)
 * 
 * Unified encryption/decryption for diary text and media files.
 * Uses PKMS format compatible with backend app/utils/diary_encryption.py
 * 
 * PKMS Format:
 * [PKMS magic 4B][version 1B][extLen 1B][extension NB][IV 12B][TAG 16B][ciphertext]
 */

const MAGIC = new Uint8Array([0x50, 0x4B, 0x4D, 0x53]); // "PKMS"
const VERSION = 0x01;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedData {
  data: Uint8Array;
  iv: string; // base64
}

export interface DecryptedData {
  data: Uint8Array;
  extension: string;
}

class DiaryCryptoService {
  /**
   * Generate encryption key from password using SHA-256
   */
  async generateEncryptionKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const key = await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return key;
  }

  /**
   * Core encryption: Encrypts data and wraps in PKMS format
   */
  async encryptData(
    data: Uint8Array,
    key: CryptoKey,
    originalExtension: string = ''
  ): Promise<Uint8Array> {
    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt with AES-GCM (produces ciphertext with appended 16-byte auth tag)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      data
    );

    const encryptedArray = new Uint8Array(encrypted);
    
    // Split ciphertext and tag (last 16 bytes are the tag)
    const ciphertext = encryptedArray.slice(0, -TAG_LENGTH);
    const tag = encryptedArray.slice(-TAG_LENGTH);

    // Encode extension as UTF-8
    const extensionBytes = new TextEncoder().encode(originalExtension);
    if (extensionBytes.length > 255) {
      throw new Error('Extension too long (max 255 bytes)');
    }

    // Build PKMS header
    const headerSize = MAGIC.length + 1 + 1 + extensionBytes.length + IV_LENGTH + TAG_LENGTH;
    const result = new Uint8Array(headerSize + ciphertext.length);
    let offset = 0;

    // Magic bytes
    result.set(MAGIC, offset);
    offset += MAGIC.length;

    // Version
    result[offset++] = VERSION;

    // Extension length
    result[offset++] = extensionBytes.length;

    // Extension bytes
    if (extensionBytes.length > 0) {
      result.set(extensionBytes, offset);
      offset += extensionBytes.length;
    }

    // IV
    result.set(iv, offset);
    offset += IV_LENGTH;

    // TAG
    result.set(tag, offset);
    offset += TAG_LENGTH;

    // Ciphertext
    result.set(ciphertext, offset);

    return result;
  }

  /**
   * Core decryption: Parses PKMS format and decrypts
   */
  async decryptData(
    pkmsBlob: Uint8Array,
    key: CryptoKey
  ): Promise<DecryptedData> {
    // Validate minimum size
    const minSize = MAGIC.length + 1 + 1 + IV_LENGTH + TAG_LENGTH;
    if (pkmsBlob.length < minSize) {
      throw new Error('Invalid PKMS file: too small');
    }

    let offset = 0;

    // Validate magic bytes
    const magic = pkmsBlob.slice(offset, offset + MAGIC.length);
    if (!this.arrayEquals(magic, MAGIC)) {
      throw new Error('Invalid PKMS file: magic bytes mismatch');
    }
    offset += MAGIC.length;

    // Validate version
    const version = pkmsBlob[offset++];
    if (version !== VERSION) {
      throw new Error(`Unsupported PKMS version: ${version}`);
    }

    // Read extension
    const extLen = pkmsBlob[offset++];
    const extensionBytes = pkmsBlob.slice(offset, offset + extLen);
    const extension = new TextDecoder().decode(extensionBytes);
    offset += extLen;

    // Read IV
    const iv = pkmsBlob.slice(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    // Read TAG
    const tag = pkmsBlob.slice(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;

    // Read ciphertext
    const ciphertext = pkmsBlob.slice(offset);

    // Reconstruct encrypted data with appended tag for AES-GCM
    const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
    encryptedWithTag.set(ciphertext, 0);
    encryptedWithTag.set(tag, ciphertext.length);

    // Decrypt
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedWithTag
      );

      return {
        data: new Uint8Array(decrypted),
        extension
      };
    } catch (error) {
      throw new Error('Decryption failed: invalid key or corrupted data');
    }
  }

  /**
   * Encrypt text content (extension = "")
   */
  async encryptText(
    content: string,
    key: CryptoKey
  ): Promise<{ encrypted_blob: string; iv: string; char_count: number }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    const encrypted = await this.encryptData(data, key, '');
    
    // Extract IV from PKMS blob for backwards compatibility
    const ivOffset = MAGIC.length + 1 + 1; // magic + version + extLen(0)
    const iv = encrypted.slice(ivOffset, ivOffset + IV_LENGTH);

    return {
      encrypted_blob: this.arrayToBase64(encrypted),
      iv: this.arrayToBase64(iv),
      char_count: content.length
    };
  }

  /**
   * Decrypt text content
   */
  async decryptText(
    encrypted_blob: string,
    key: CryptoKey
  ): Promise<string> {
    const pkmsBlob = this.base64ToArray(encrypted_blob);
    const decrypted = await this.decryptData(pkmsBlob, key);
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted.data);
  }

  /**
   * Encrypt file (preserves original extension)
   */
  async encryptFile(
    file: File,
    key: CryptoKey
  ): Promise<Blob> {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Extract extension from filename
    const extension = file.name.split('.').pop() || '';

    // Encrypt
    const encrypted = await this.encryptData(data, key, extension);

    // Return as Blob with .dat extension
    return new Blob([encrypted], { type: 'application/octet-stream' });
  }

  /**
   * Decrypt file (restores original extension)
   */
  async decryptFile(
    encryptedBlob: Blob,
    key: CryptoKey,
    originalName: string = 'decrypted'
  ): Promise<File> {
    // Read encrypted blob
    const arrayBuffer = await encryptedBlob.arrayBuffer();
    const pkmsBlob = new Uint8Array(arrayBuffer);

    // Decrypt
    const decrypted = await this.decryptData(pkmsBlob, key);

    // Reconstruct filename with original extension
    const baseName = originalName.replace(/\.[^.]*$/, ''); // Remove any extension
    const fileName = decrypted.extension 
      ? `${baseName}.${decrypted.extension}`
      : baseName;

    // Return as File
    return new File([decrypted.data], fileName, {
      type: this.getMimeType(decrypted.extension)
    });
  }

  // Helper methods

  private arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private arrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array));
  }

  private base64ToArray(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

export const diaryCryptoService = new DiaryCryptoService();

