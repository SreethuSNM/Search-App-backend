/**
 * Encryption Utilities for Consent Management Platform
 * Provides secure encryption and decryption functions using the Web Crypto API
 */
const EncryptionUtils = {
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
     * @param {string[]} usages - Array of key usages ['encrypt', 'decrypt']
     * @returns {Promise<CryptoKey>}
     */
    async importKey(rawKey, usages = ['encrypt', 'decrypt']) {
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
    async encrypt(data, key, iv) {
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
    async decrypt(encryptedData, key, iv) {
        const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encryptedBytes
        );
        return new TextDecoder().decode(decrypted);
    }
};

/**
 * Loads categorized scripts from the server with encryption
 * @returns {Promise<Array>} Array of categorized scripts
 */
async function loadCategorizedScripts() {
    try {
        // Get session token from localStorage
        const sessionToken = localStorage.getItem('visitorSessionToken');
        if (!sessionToken) {
            console.error('No session token found');
            return [];
        }

        // Get or generate visitorId
        let visitorId = localStorage.getItem('visitorId');
        if (!visitorId) {
            visitorId = crypto.randomUUID();
            localStorage.setItem('visitorId', visitorId);
        }

        // Get site name from hostname
        const siteName = window.location.hostname.replace(/^www\./, '').split('.')[0];
        
        // Generate encryption key and IV
        const { key, iv } = await EncryptionUtils.generateKey();
        
        // Prepare request data
        const requestData = {
            siteName: siteName,
            visitorId: visitorId,
            userAgent: navigator.userAgent
        };
        
        // Encrypt the request data
        const encryptedRequest = await EncryptionUtils.encrypt(
            JSON.stringify(requestData),
            key,
            iv
        );
        
        // Send the encrypted request
        const response = await fetch('https://cb-server.web-8fb.workers.dev/api/cmp/script-category', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'X-Request-ID': crypto.randomUUID(),
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify({
                encryptedData: encryptedRequest,
                key: Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
                iv: Array.from(iv)
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to load categorized scripts:', errorData);
            return [];
        }

        const data = await response.json();
        
        // Decrypt the response data
        if (data.encryptedData) {
            const responseKey = await EncryptionUtils.importKey(
                new Uint8Array(data.key),
                ['decrypt']
            );
            
            const decryptedData = await EncryptionUtils.decrypt(
                data.encryptedData,
                responseKey,
                new Uint8Array(data.iv)
            );
            
            const responseObj = JSON.parse(decryptedData);
            return responseObj.scripts || [];
        } else {
            console.error('Response does not contain encrypted data');
            return [];
        }
    } catch (error) {
        console.error('Error loading categorized scripts:', error);
        return [];
    }
} 