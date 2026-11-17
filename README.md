# binjamin

A recycling buddy for an iPad mounted between the recycling and landfill bins. Hold up a piece of trash: Binjamin (a crude hand-drawn hamster) examines it, tells you which bin it goes in, then reacts to whether you listened.

Everything runs in Safari on the iPad: no app, no server, no cloud.

| Piece | What it does |
|---|---|
| MediaPipe Face Landmarker | wakes him up when someone **stares** at him (head facing + eyes on him). Detection only, no identity, nothing stored |
| MediaPipe Hand Landmarker | finds the hand holding the item |
| MediaPipe Image Classifier (EfficientNet-Lite0, ImageNet) | classifies a crop around the hand, voted over ~1.3s |
| [js/bins.js](js/bins.js) | ImageNet label → recycle / landfill / "that's your phone bro" |
| OpenCV.js | frame-diff motion: setup wave test, tracks which side the item went (and wakes him up if the face model fails) |
| [js/brain.js](js/brain.js) | hand-written state machine (idle → noticed → examining → verdict → happy/sad) |

## Run it

**On a laptop (dev):**
```bash
python -m http.server 8000
# open http://localhost:8000   (localhost counts as secure, so the camera works)
```

**On the iPad:** the camera needs HTTPS. Easiest: push to GitHub → Settings → Pages → deploy from `main` → open `https://<you>.github.io/binjamin/` in Safari.
Then: Share → **Add to Home Screen** (real full-screen), Settings → Display → Auto-Lock **Never**, Settings → Apps → Safari → Camera **Allow**, and turn on **Guided Access** to lock it to the page.

After the first load, a service worker caches the models so it keeps working if the Wi-Fi at the bin drops. To skip CDNs entirely, run `bash scripts/fetch-assets.sh` (about 25 MB into `vendor/` and `models/`), which the app prefers automatically.

## Setup mode

Runs automatically on first launch (and again with a triple-tap on the **top-right corner**, or `S`):
1. Start camera.
2. Drag the dashed line to where the bins split.
3. **Wave at the recycling bin** for 3 seconds. OpenCV compares motion on the left vs right of the line and picks the recycling side. You can also just tap "recycling is on my LEFT/RIGHT".
4. Confirm or flip. Saved in the browser.

"Left/right" always means *from the view of a person facing the iPad*.

## Controls

| Key | iPad | Does |
|---|---|---|
| `1`–`9`, `0` | debug panel buttons | force a state (idle, noticed, examining, recycle, landfill, confused, happy, sad, nottrash, loading) |
| `space` | | step to next state |
| `A` | "A auto" | back to automatic (camera-driven) mode |
| `D` | triple-tap top-left | debug overlay: camera view, hand box, motion blob, midline, votes, what the classifier sees |
| `S` | triple-tap top-right | setup |
| `F` | "F flip sides" | swap recycle/landfill sides |

URL switches for troubleshooting: `?nocv` (skip OpenCV), `?novision` (skip MediaPipe).

## Drawing Binjamin

Placeholder hamsters are drawn in code. Replace them by dropping PNGs into `art/` and listing them in [art/manifest.js](art/manifest.js): per state, 2–3 variants × 1–3 wobble frames. The title, instructions, arrow and RECYCLE/LANDFILL labels have slots there too. Anything missing falls back to the placeholder, so you can fill them in one at a time. Draw the pointing poses pointing **left**; he's mirrored automatically.

## Tuning

All the knobs are in [js/config.js](js/config.js) (timings, confidence thresholds, motion sensitivity, crop size), and all his lines are in [js/copy.js](js/copy.js). Use the debug overlay at the real bin to tune; it shows the labels the classifier is actually seeing.

**Stare tuning:** the debug `face:` line shows each stare check (size, head turn, eye direction, blink) and puts a `!` after whichever one is failing. Adjust the matching limit in `CONFIG.face`. The cyan box means STARING; grey means a face that isn't looking at him.

## Known limits (v0)

- The ImageNet classifier knows bottles, cups, cartons, food and bags reasonably well, and lots of real trash poorly. Low confidence → confused → landfill, by design. Fine-tuning on TrashNet/TACO is the next step.
- Compliance tracking uses the hand's last position plus the OpenCV motion blob right after the hand disappears. People walking away also make motion, so watch the `exit:` line in debug and set `compliance.enabled = false` if it's flaky.
