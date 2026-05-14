# sacred_not_secret — Three.js rebuild

Reconstruction of MACBETH's HERMES Agent Creative Hackathon entry
(`x.com/macbethAI/status/2051174052707053733`, May 4 2026) as a self-contained
Three.js experience. **No audio** — music and music-reaction parts of the
original are skipped per the rebuild brief.

## Run it

The static page is served by the project dev server:

```
npm start
# then open http://localhost:3000/sacred-not-secret/
```

## What's modelled

The original 59-second clip is a slow 3D study of a Salt Lake Temple-style
gothic cathedral that breaks apart, drifts in a void, and snaps back together,
all rendered with a heavy ordered-dither / halftone post-process on a black
background. The middle of the video also shows a red-edge wireframe pass.

This rebuild reproduces:

| Element                | Implementation                                    |
| ---------------------- | ------------------------------------------------- |
| Salt Lake-style temple | Procedural in `cathedral.js` — 6 spires (3 east / 3 west), parapeted long walls, gothic-arch windows, buttresses, ground pedestal, entrance steps |
| Halftone aesthetic     | `halftone-shader.js` — ordered dot pattern whose radius tracks per-pixel luma, with radial vignette, applied via `EffectComposer` |
| Fragmentation          | Each cathedral piece is its own scatter chunk; the choreographer interpolates between rest and an outward-blast pose, with per-chunk spin axes |
| Red wireframe phase    | `EdgesGeometry` overlay swapped in for one phase of the loop |
| Choreography           | 6-phase state machine: ASSEMBLE → SHATTER → DRIFT → REASSEMBLE → WIREFRAME → FINAL, total ≈59s, then loops |
| 3D source artifact     | `assets/cathedral.glb` — the assembled cathedral, exported via `GLTFExporter` for downstream reuse |

## Interactivity

| Input                | Behaviour                                  |
| -------------------- | ------------------------------------------ |
| Mouse drag           | Orbit camera                                |
| Mouse wheel          | Dolly in / out                              |
| Idle 3s              | Resume auto-orbit                           |
| `Space`              | Skip to the next phase                      |
| `P`                  | Toggle auto-orbit                           |
| `G`                  | Re-export the current cathedral as a `.glb` |

## File layout

```
sacred-not-secret/
├── index.html
├── style.css
├── main.js                  # scene, lighting, post, choreographer
├── cathedral.js             # procedural temple + chunk metadata
├── halftone-shader.js       # the ordered-dither pass
├── assets/
│   ├── cathedral.glb        # exported GLB of the assembled model
│   └── *.png                # rendered reference shots of each phase
└── lib/
    ├── three.module.js      # Three r160 (vendored)
    └── addons/...           # OrbitControls, EffectComposer, GLTFExporter
```

## What's intentionally missing

- **No audio.** The original is paired with an original score; this rebuild
  is silent by design.
- **No tweets / music-reaction context.** The brief explicitly asks to skip
  those parts of the thread.
