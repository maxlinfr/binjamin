# binjamin

A recycling buddy for an iPad mounted between the recycling and landfill bins. Hold up a piece of trash: Binjamin (a crude hand-drawn hamster) examines it, tells you which bin it goes in, then reacts to whether you listened.

Everything runs in Safari on the iPad: no app, no server, no cloud.

Four models, one job each, in the order they kick in:

| Model | Job |
|---|---|
| 1. MediaPipe Face Landmarker | wakes him up when someone **stares** at him (head facing + eyes on him). Detection only, no identity, nothing stored |
| 2. MediaPipe Hand Landmarker | finds a hand **held still** (passersby ignored), then tracks where it leaves to see which bin it went in |
| 3. MediaPipe Object Detector (EfficientDet-Lite0) | uses the hand as a waypoint to find the **object** in it, so the crop is the item, not your hand |
| 4. MobileCLIP-S0 (Transformers.js) | **trash model**: picks from the list in [js/trash-labels.js](js/trash-labels.js) (trash *and* "not trash" like phones), voted over ~1.3s |

The rest is plain code: [js/brain.js](js/brain.js) is the state machine (idle → noticed → examining → verdict → happy/sad), [js/bins.js](js/bins.js) turns the votes into a verdict.

## Run it

**On a laptop (dev):**
```bash
python -m http.server 8000
# open http://localhost:8000   (localhost counts as secure, so the camera works)
```

**On the iPad:** the camera needs HTTPS. Easiest: push to GitHub → Settings → Pages → deploy from `main` → open `https://<you>.github.io/binjamin/` in Safari.
Then: Share → **Add to Home Screen** (real full-screen), Settings → Display → Auto-Lock **Never**, Settings → Apps → Safari → Camera **Allow**, and turn on **Guided Access** to lock it to the page.

After the first load, a service worker caches the models so it keeps working if the Wi-Fi at the bin drops. To skip CDNs for the MediaPipe models, run `bash scripts/fetch-assets.sh` (into `vendor/` and `models/`), which the app prefers automatically.

## Setup mode

Runs automatically on first launch (and again with a triple-tap on the **top-right corner**, or `S`):
1. Start camera.
2. Drag the dashed line to where the bins split.
3. Tap "recycling is on my LEFT" or "RIGHT".
4. Confirm or flip. Saved in the browser.

"Left/right" always means *from the view of a person facing the iPad*.

## Controls

| Key | iPad | Does |
|---|---|---|
| `1`–`9`, `0` | debug panel buttons | force a state (idle, noticed, examining, recycle, landfill, confused, happy, sad, nottrash, loading) |
| `space` | | step to next state |
| `A` | "A auto" | back to automatic (camera-driven) mode |
| `D` | triple-tap top-left | debug overlay: camera view, face/hand/object boxes, midline, votes, what the trash model sees |
| `S` | triple-tap top-right | setup |
| `F` | "F flip sides" | swap recycle/landfill sides |

URL switch for troubleshooting: `?novision` (skip all models, to click through the states by hand).

## Drawing Binjamin

Placeholder hamsters are drawn in code. Replace them by dropping PNGs into `art/` and listing them in [art/manifest.js](art/manifest.js): per state, 2–3 variants × 1–3 wobble frames. The title, instructions, arrow and RECYCLE/LANDFILL labels have slots there too. Anything missing falls back to the placeholder, so you can fill them in one at a time. Draw the pointing poses pointing **left**; he's mirrored automatically.

## The classifier

**What gets classified:** the hand is just a waypoint. Each "examining" frame, the object detector searches a window around the hand for something the fingers are touching (bottle, cup, banana, phone…) and crops **that object**. Its label doesn't matter (it once called a coffee cup a "remote"); it only supplies the box. If it finds nothing (it doesn't know wrappers or napkins), the crop falls back to around the hand, like before. The orange box in the debug view is what got cropped. Turn it off with `object.enabled = false` in [js/config.js](js/config.js).

**The call:** the trash model scores every crop; the scores are averaged over the ~1.3s and added up per bin.
- recycle or landfill adds up to **≥ 0.6** → that bin
- not trash (phone, keys, reusable bottle…) adds up to **≥ 0.4** → "that's yours". The bar is lower on purpose: wrongly saying "that's yours" is harmless, sending someone's Hydro Flask to landfill isn't.
- otherwise → confused → landfill

On 49 TrashNet photos: the old ImageNet setup got **33%**, the trash model **71%**. (ImageNet was removed: it was far less accurate, and as a fallback it could swap a right answer for a wrong one.)

**Editing the trash list:** edit [js/trash-labels.js](js/trash-labels.js) (plain English descriptions), then rebuild:
```bash
npm install        # once (~200 MB of dev tools; keep node_modules out of OneDrive sync if you can)
npm run labels     # rewrites models/trash-text-embeddings.json; commit that file
```

**Testing it:** open `/bench.html`, drop in photos of real trash, and see the verdict plus what the trash model saw. Name files `recycle_…`, `landfill_…`, `nottrash_…` to get an accuracy score.

Don't set the trash model's `dtype` to `'q8'`: that quantized version is broken for this model (10% accuracy in tests).

## Tuning

All the knobs are in [js/config.js](js/config.js) (timings, confidence thresholds, hand/stare sensitivity, crop size), and all his lines are in [js/copy.js](js/copy.js). Use the debug overlay at the real bin to tune; it shows what the trash model is actually seeing.

**Stare tuning:** the debug `face:` line shows each stare check (size, head turn, eye direction, blink) and puts a `!` after whichever one is failing. Adjust the matching limit in `CONFIG.face`. The cyan box means STARING; grey means a face that isn't looking at him.

## Known limits (v0)

- The trash model only knows what's on the list, and paper is its weak spot (flyers read as receipts/wrappers). Low confidence → confused → landfill, by design. Add descriptions to the list before reaching for a new model.
- Until the trash model has loaded (23 MB, cached after the first visit) he stays on the sleepy loading screen.
- Compliance tracking uses where the hand was last seen (and which way it was moving). Watch the `exit:` line in debug and set `compliance.enabled = false` if it's flaky.
