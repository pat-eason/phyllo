//! Move files to the OS Trash (never a hard delete).

use std::path::Path;

use crate::error::{Error, Result};

pub fn move_to_trash(path: &Path) -> Result<()> {
    if std::fs::symlink_metadata(path).is_err() {
        return Err(Error::NotFound(path.display().to_string()));
    }
    trash::delete(path).map_err(|e| Error::Trash(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_path_is_not_found_without_touching_the_trash() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            move_to_trash(&tmp.path().join("nope.phyllo"))
                .unwrap_err()
                .code(),
            "not_found"
        );
    }
}
