use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("encryption error: {0}")]
    Encryption(String),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("validation error: {0}")]
    Validation(String),

    #[error("period locked: transaction falls within a locked period")]
    PeriodLocked,

    #[error("entries do not balance: debits {debits} != credits {credits}")]
    UnbalancedEntries { debits: String, credits: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("AI service unavailable: {0}")]
    AiService(String),

    #[error("no active client selected")]
    NoActiveClient,

    #[error("wrong passphrase or corrupted database")]
    WrongPassphrase,
}

/// Tauri commands must return serde-serializable errors.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
