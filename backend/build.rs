use std::path::Path;
use std::process::Command;
use std::{env, fs};

const MODELS: &[(&str, &str)] = &[
    (
        "PP-OCRv5_mobile_det.mnn",
        "https://github.com/zibo-chen/rust-paddle-ocr/raw/next/models/PP-OCRv5_mobile_det.mnn",
    ),
    (
        "latin_PP-OCRv5_mobile_rec_infer.mnn",
        "https://github.com/zibo-chen/rust-paddle-ocr/raw/next/models/latin_PP-OCRv5_mobile_rec_infer.mnn",
    ),
    (
        "ppocr_keys_latin.txt",
        "https://github.com/zibo-chen/rust-paddle-ocr/raw/next/models/ppocr_keys_latin.txt",
    ),
];

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let models_dir = Path::new(&manifest_dir).join("models");

    let all_present = MODELS
        .iter()
        .all(|(name, _)| models_dir.join(name).exists());

    if all_present {
        return;
    }

    fs::create_dir_all(&models_dir).expect("Failed to create models directory");

    for (name, url) in MODELS {
        let dest = models_dir.join(name);
        if dest.exists() {
            continue;
        }
        println!("cargo:warning=Downloading OCR model: {name}");
        let status = Command::new("curl")
            .args(["-fsSL", "-o", dest.to_str().unwrap(), url])
            .status()
            .expect("Failed to run curl. Is curl installed?");
        if !status.success() {
            println!("cargo:warning=Failed to download {name} — OCR will be disabled at runtime");
            // Clean up partial download
            let _ = fs::remove_file(&dest);
        }
    }
}
