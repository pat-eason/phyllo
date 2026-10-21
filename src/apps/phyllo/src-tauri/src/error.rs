//! Error type shared by every command. Serialized to `{ code, message }` for JS.

use std::io;
use std::path::Path;

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{path}: {source}")]
    Io {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    InvalidFormat(String),
    #[error("{0}")]
    InvalidArgument(String),
    #[error("could not move to Trash: {0}")]
    Trash(String),
    #[error("watcher error: {0}")]
    Watch(String),
    #[error("MIDI error: {0}")]
    Midi(String),
    #[error("OSC error: {0}")]
    Osc(String),
    #[error("{0}")]
    UnsupportedFormat(String),
    #[error("encode error: {0}")]
    Encode(String),
    #[error("menu error: {0}")]
    Menu(String),
    #[error("tray error: {0}")]
    Tray(String),
    #[error("notification error: {0}")]
    Notification(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("{0}")]
    Internal(String),
}

impl Error {
    /// Stable machine-readable code; mirrored by `NativeErrorCode` in `src/native/types.ts`.
    pub fn code(&self) -> &'static str {
        match self {
            Error::NotFound(_) => "not_found",
            Error::Io { source, .. } if source.kind() == io::ErrorKind::NotFound => "not_found",
            Error::Io { .. } => "io",
            Error::Json(_) => "json",
            Error::InvalidFormat(_) => "invalid_format",
            Error::InvalidArgument(_) => "invalid_argument",
            Error::Trash(_) => "trash",
            Error::Watch(_) => "watch",
            Error::Midi(_) => "midi",
            Error::Osc(_) => "osc",
            Error::UnsupportedFormat(_) => "unsupported_format",
            Error::Encode(_) => "encode",
            Error::Menu(_) => "menu",
            Error::Tray(_) => "tray",
            Error::Notification(_) => "notification",
            Error::Network(_) => "network",
            Error::Internal(_) => "internal",
        }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut st = serializer.serialize_struct("Error", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

/// Attach the offending path to an `io::Error`.
pub trait IoContext<T> {
    fn at(self, path: &Path) -> Result<T>;
}

impl<T> IoContext<T> for std::result::Result<T, io::Error> {
    fn at(self, path: &Path) -> Result<T> {
        self.map_err(|source| Error::Io {
            path: path.display().to_string(),
            source,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_code_and_message() {
        let v = serde_json::to_value(Error::InvalidFormat("bad".into())).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "code": "invalid_format", "message": "bad" })
        );
    }

    #[test]
    fn missing_file_maps_to_not_found() {
        let p = Path::new("/definitely/not/here");
        let err = std::fs::read(p).at(p).unwrap_err();
        assert_eq!(err.code(), "not_found");
    }
}
