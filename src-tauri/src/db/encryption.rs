/// Key derivation and field-level encryption helpers.
///
/// # Key hierarchy
/// - master_passphrase (user-supplied at launch)
///   ├─ app_db_key     = argon2(passphrase, salt = b"taxeasy-app-db")
///   ├─ client_db_key  = argon2(passphrase, salt = client_uuid_bytes)
///   └─ ein_key        = argon2(passphrase, salt = b"taxeasy-ein-enc")
///
/// SQLCipher keys are 32-byte raw hex; AES-256-GCM is used for the EIN field.
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::RngCore;

use crate::error::{AppError, Result};

/// Derive a 32-byte key suitable for SQLCipher or AES-256-GCM.
///
/// `salt` must be unique per use-case to avoid key reuse across contexts.
pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let mut output = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut output)
        .map_err(|e| AppError::Encryption(e.to_string()))?;
    Ok(output)
}

/// Format a raw key for use as a SQLCipher hex key PRAGMA.
pub fn sqlcipher_hex_key(raw: &[u8; 32]) -> String {
    format!(
        "x'{}'",
        raw.iter().map(|b| format!("{b:02X}")).collect::<String>()
    )
}

/// Derive the app.db SQLCipher key from the master passphrase.
pub fn app_db_key(passphrase: &str) -> Result<[u8; 32]> {
    derive_key(passphrase, b"taxeasy-app-db-v1")
}

/// Derive a per-client SQLCipher key.
/// Uses the client UUID bytes as part of the salt so each client DB has a unique key.
pub fn client_db_key(passphrase: &str, client_id: &str) -> Result<[u8; 32]> {
    let mut salt = [0u8; 32];
    // Prefix + first 16 bytes of client UUID (hex decoded if valid, else raw bytes)
    let prefix = b"taxeasy-client-v1";
    let id_bytes = client_id.as_bytes();
    let copy_len = salt.len().min(prefix.len());
    salt[..copy_len].copy_from_slice(&prefix[..copy_len]);
    // XOR the id bytes into the salt for uniqueness
    for (i, b) in id_bytes.iter().take(salt.len()).enumerate() {
        salt[i] ^= b;
    }
    derive_key(passphrase, &salt)
}

/// Derive the EIN field-encryption key.
pub fn ein_key(passphrase: &str) -> Result<[u8; 32]> {
    derive_key(passphrase, b"taxeasy-ein-field-v1")
}

/// Encrypt plaintext with AES-256-GCM.
/// Returns `nonce (12 bytes) || ciphertext`.
pub fn encrypt_field(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| AppError::Encryption(e.to_string()))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Encryption(e.to_string()))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypt a blob produced by `encrypt_field`.
pub fn decrypt_field(key: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>> {
    if blob.len() < 12 {
        return Err(AppError::Encryption("ciphertext too short".into()));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| AppError::Encryption(e.to_string()))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Encryption("decryption failed — wrong key or corrupted data".into()))
}
