/**
 * Encryption Utilities for Consent Management Platform
 * Provides secure encryption and decryption functions using the Web Crypto API
 */

export const EncryptionUtils = {
    /**
     * Generates a new encryption key and IV
     * @returns {Promise<{key: CryptoKey, iv: Uint8Array}>}
     */
    async generateKey() {
        const key = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        return { key, iv };
    },

    /**
     * Imports a raw key for encryption/decryption
     * @param {Uint8Array} rawKey - The raw key bytes
     * @param {KeyUsage[]} usages - Array of key usages ['encrypt', 'decrypt']
     * @returns {Promise<CryptoKey>}
     */
    async importKey(rawKey: Uint8Array, usages: KeyUsage[] = ['encrypt', 'decrypt']) {
        return await crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: 'AES-GCM' },
            false,
            usages
        );
    },

    /**
     * Encrypts data using AES-GCM
     * @param {string} data - The data to encrypt
     * @param {CryptoKey} key - The encryption key
     * @param {Uint8Array} iv - The initialization vector
     * @returns {Promise<string>} - Base64 encoded encrypted data
     */
    async encrypt(data: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encodedData
        );
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    },

    /**
     * Decrypts data using AES-GCM
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @param {CryptoKey} key - The decryption key
     * @param {Uint8Array} iv - The initialization vector
     * @returns {Promise<string>} - Decrypted data
     */
    async decrypt(encryptedData: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
        const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encryptedBytes
        );
        return new TextDecoder().decode(decrypted);
    }
}; 