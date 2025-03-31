import crypto from 'crypto';

interface Script {
  url?: string;
  category?: string;
  name?: string;
  script?: string;
  [key: string]: string | undefined; // Allow dynamic string keys
}

interface SanitizedScript {
  url?: string;
  category?: string;
  name?: string;
  id: string;
}

export class SecurityUtils {
  private static readonly SENSITIVE_FIELDS = ['script', 'apiKey', 'secret', 'password', 'token'];
  
  /**
   * Sanitizes script data by removing sensitive information and adding security measures
   */
  static sanitizeScript(script: Script): SanitizedScript {
    // Create a sanitized version of the script
    const sanitized: SanitizedScript = {
      url: script.url,
      category: script.category,
      name: script.name,
      id: this.generateScriptId(script)
    };

    // Remove any sensitive fields
    this.SENSITIVE_FIELDS.forEach(field => {
      if (field in sanitized) {
        delete sanitized[field as keyof SanitizedScript];
      }
    });

    return sanitized;
  }

  /**
   * Generates a unique ID for a script based on its content
   */
  private static generateScriptId(script: Script): string {
    const content = `${script.url || ''}${script.name || ''}${script.category || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validates script data before processing
   */
  static validateScript(script: Script): boolean {
    if (!script) return false;
    
    // Validate URL if present
    if (script.url) {
      try {
        new URL(script.url);
      } catch {
        return false;
      }
    }

    // Validate category if present
    if (script.category && typeof script.category !== 'string') {
      return false;
    }

    // Validate name if present
    if (script.name && typeof script.name !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Sanitizes an array of scripts
   */
  static sanitizeScripts(scripts: Script[]): SanitizedScript[] {
    return scripts
      .filter(script => this.validateScript(script))
      .map(script => this.sanitizeScript(script));
  }

  /**
   * Adds security headers to a response
   */
  static addSecurityHeaders(headers: Headers): void {
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';");
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
} 