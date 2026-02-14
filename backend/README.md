# meemi-backend

Rust backend for meemi_kansio, built with Axum and PostgreSQL.

## Prerequisites

- Rust toolchain (edition 2024)
- PostgreSQL (via Docker Compose: `docker compose up -d`)
- `cmake` and a C++ compiler (for building the MNN inference library used by OCR)
- `libclang-dev` (for bindgen, used by the OCR dependency)
- `ffmpeg` and `ffprobe` (for video thumbnail generation)

## Build

```sh
cargo build
```

The first build takes several minutes as it compiles the MNN C++ library from source.

## OCR Setup

Text recognition uses [ocr-rs](https://github.com/zibo-chen/rust-paddle-ocr) (PaddleOCR with MNN backend). To enable OCR, place model files in the `models/` directory (or set `MODEL_DIR`):

- `PP-OCRv5_mobile_det.mnn`
- `latin_PP-OCRv5_mobile_rec_infer.mnn`
- `ppocr_keys_latin.txt`

Models are available from the [ocr-rs repository](https://github.com/zibo-chen/rust-paddle-ocr/tree/next/models). If models are missing, the server starts normally with OCR disabled.

## Vendored ocr-rs

The `ocr-rs` crate is vendored under `vendor/ocr-rs/` with a patch to its `build.rs` that fixes an MNN build error (`OpType_LinearAttention` missing from `MNN_generated.h`). The MNN C++ source itself is not vendored; it gets cloned from GitHub during the first build and patched automatically.

## Run

```sh
cargo run
```

Or with file watching (requires [bacon](https://github.com/Canop/bacon)):

```sh
bacon run
```
