/**
 * Storage/encryption adapter interface.
 * Default implementation uses an environment variable encryption key.
 * Swap to AWS KMS, GCP KMS, or HashiCorp Vault by implementing this interface.
 */
export interface StorageAdapter {
  /** Encrypt a plaintext value */
  encrypt(plaintext: string): Promise<string>;
  /** Decrypt an encrypted value */
  decrypt(ciphertext: string): Promise<string>;
}
