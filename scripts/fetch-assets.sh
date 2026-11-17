#!/usr/bin/env bash
# Optional: download the models + libraries into the repo so Binjamin never
# needs a CDN (the app automatically prefers these local copies if they exist).
# (The trash model is not included: it still comes from Hugging Face and is cached after the first load.)
# Run from the repo root:  bash scripts/fetch-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MP=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14
mkdir -p vendor/mediapipe/wasm models

get() { echo "-> $2"; curl -fsSL "$1" -o "$2"; }

get "$MP/vision_bundle.mjs" vendor/mediapipe/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  get "$MP/wasm/$f" "vendor/mediapipe/wasm/$f"
done
get https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task models/face_landmarker.task
get https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task models/hand_landmarker.task
get https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite models/efficientdet_lite0.tflite

echo "done. binjamin will now load everything locally."
