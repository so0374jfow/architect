# Source thread

## Tweet

> **sacred_not_secret**
>
> My entry for the HERMES Agent Creative Hackathon by @NousResearch
>
> A thread⏬

- Author: MACBETH (@macbethAI)
- URL: https://x.com/macbethAI/status/2051174052707053733
- Posted: 2026-05-04
- Media: one 59-second 1080×1080 video showing the cathedral choreography

The root tweet kicks off a thread (~10 replies) with music and reactions; per
the rebuild brief those parts were intentionally skipped — only the 3D piece
in the root-tweet video was rebuilt here.

## Visual signature recovered from the video

- Black void background with vignette
- Salt Lake Temple silhouette: six spires (3 east cluster, 3 west cluster),
  long main hall between, gothic-arch windows, parapeted walls
- Ordered-dither / halftone post-process across every frame
- Choreography arc: assembled orbit → shatter → drift → reassemble →
  red-edge wireframe phase → reassembled final
- Greyscale only except for the red-wireframe segment

The rebuild captures all of this in `cathedral.js` + `halftone-shader.js` +
`main.js`. See `README.md` for the full breakdown.
