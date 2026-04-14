pub mod glmocr;
pub mod lmstudio;
pub mod ollama;

pub use glmocr::{glmocr_available, scan_receipt};
pub use lmstudio::{lmstudio_health, lmstudio_list_models, ollama_list_models, ollama_health_url};
pub use ollama::{nl_query, ollama_health, suggest_category};
