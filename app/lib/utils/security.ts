import crypto from 'crypto';

interface Script {
  src: string | null;
  type: string | null;
  async: boolean | null;
  defer: boolean | null;
  content: string | null;
}


export class SecurityUtils {
  static addSecurityHeaders(headers: Headers) {
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  static sanitizeScripts(scripts: Script[]): Script[] {
    return scripts.map(script => ({
      src: script.src,
      type: script.type,
      async: script.async,
      defer: script.defer,
      content: null // Remove sensitive content
    }));
  }
}

export class ServerEncryption {
  private readonly encryptionKey: Buffer;
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly IV_LENGTH = 16;

  constructor(encryptionKey: string) {
    if (!encryptionKey) {
      throw new Error('Server encryption key not configured');
    }
    // Create a 32-byte key using SHA-256 hash
    this.encryptionKey = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  /**
   * Encrypts data using AES-256-CBC
   */
  encrypt<T>(data: T): string {
    try {
      // Generate a random IV
      const iv = crypto.randomBytes(ServerEncryption.IV_LENGTH);
      
      // Create cipher
      const cipher = crypto.createCipheriv(
        ServerEncryption.ALGORITHM,
        this.encryptionKey,
        iv
      );

      // Convert data to string and encrypt
      const dataString = JSON.stringify(data);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Combine IV and encrypted data
      const combined = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'hex')
      ]);

      // Return as base64
      return combined.toString('base64');
    } catch (error) {
      console.error('Error encrypting data:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts data using AES-256-CBC
   */
  decrypt<T>(encryptedData: string): T {
    try {
      // Convert from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract IV and encrypted data
      const iv = combined.slice(0, ServerEncryption.IV_LENGTH);
      const encrypted = combined.slice(ServerEncryption.IV_LENGTH);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        ServerEncryption.ALGORITHM,
        this.encryptionKey,
        iv
      );

      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Parse and return
      return JSON.parse(decrypted.toString('utf8')) as T;
    } catch (error) {
      console.error('Error decrypting data:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypts an array of scripts
   */
  encryptScripts(scripts: Script[]): string[] {
    return scripts.map(script => this.encrypt<Script>(script));
  }

  /**
   * Decrypts an array of scripts
   */
  decryptScripts(encryptedScripts: string[]): Script[] {
    return encryptedScripts.map(encrypted => this.decrypt<Script>(encrypted));
  }
} 