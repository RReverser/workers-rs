use std::{fs::OpenOptions, io::Write, path::PathBuf};

use anyhow::{Context, Result};
use flate2::read::GzDecoder;

const ESBUILD_VERSION: &str = "0.25.4";
const BINARY_EXTENSION: &str = if cfg!(windows) { ".exe" } else { "" };

pub fn ensure_esbuild() -> Result<PathBuf> {
    let esbuild_binary = format!("esbuild-{ESBUILD_VERSION}{BINARY_EXTENSION}");
    let esbuild_bin_path = dirs_next::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(esbuild_binary);

    let mut options = std::fs::OpenOptions::new();
    fix_permissions(&mut options);

    match options.create_new(true).write(true).open(&esbuild_bin_path) {
        Ok(new_file) => download_esbuild(new_file).map_err(|e| {
            // If the download fails, we should remove the file.
            // Ignore the error if it fails to remove - we're already in an error state.
            _ = std::fs::remove_file(&esbuild_bin_path);
            e.context("Failed to download esbuild binary")
        }),
        // If the file already exists, we assume it's been previously installed correctly.
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(e).context("Failed to open esbuild binary file"),
    }?;

    Ok(esbuild_bin_path)
}

fn download_esbuild(mut writer: impl Write) -> Result<()> {
    println!("Installing esbuild...");

    let os = match std::env::consts::OS {
        "darwin" => "macos",
        "windows" => "win32",
        os => os,
    };

    let arch = match std::env::consts::ARCH {
        "powerpc64" => "ppc64",
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "x86" => "ia32",
        arch => arch,
    };

    let esbuild_url = format!(
        "https://registry.npmjs.org/@esbuild/{platform}/-/{platform}-{ESBUILD_VERSION}.tgz",
        platform = format_args!("{os}-{arch}")
    );

    let mut res = ureq::get(&esbuild_url)
        .call()
        .with_context(|| format!("Couldn't download esbuild from {}", esbuild_url))?;
    let body = res.body_mut().as_reader();
    let deflater = GzDecoder::new(body);
    let mut archive = tar::Archive::new(deflater);

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;

        if path
            .file_name()
            .map(|name| name == format!("esbuild{BINARY_EXTENSION}").as_str())
            .unwrap_or(false)
        {
            std::io::copy(&mut entry, &mut writer)?;
            return Ok(());
        }
    }

    anyhow::bail!("no esbuild binary in archive")
}

#[cfg(target_family = "unix")]
fn fix_permissions(options: &mut OpenOptions) -> &mut OpenOptions {
    use std::os::unix::fs::OpenOptionsExt;
    options.mode(0o770)
}

#[cfg(target_family = "windows")]
fn fix_permissions(options: &mut OpenOptions) -> &mut OpenOptions {
    options
}
