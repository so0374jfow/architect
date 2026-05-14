// Halftone / ordered-dither post-processing shader.
//
// Matches the look in macbethAI's "sacred_not_secret":
//   - Black background
//   - Greyscale subject quantized to a circular halftone dot pattern
//   - Cell size varies with subject brightness (so highlights look "filled in"
//     and shadows almost vanish), the way newspaper printing behaves.
//   - Soft radial vignette pulls focus to the centre.
//
// The shader runs as a full-screen pass via three's EffectComposer.

import * as THREE from 'three';

export const HalftoneShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uResolution:{ value: new THREE.Vector2(1, 1) },
    uCellPx:    { value: 5.0 },  // halftone cell size in pixels
    uIntensity: { value: 1.0 },  // 0 = pure source, 1 = full halftone
    uVignette:  { value: 0.85 },
    uWireframeMode: { value: 0.0 }, // 0 = halftone, 1 = red wireframe pass-through
    uTime:      { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uResolution;
    uniform float uCellPx;
    uniform float uIntensity;
    uniform float uVignette;
    uniform float uWireframeMode;
    uniform float uTime;
    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);

      // ── wireframe pass: just colour-tinted source with vignette ───
      if (uWireframeMode > 0.5) {
        float v = clamp(1.0 - length(vUv - 0.5) * uVignette, 0.0, 1.0);
        gl_FragColor = vec4(src.rgb * v, 1.0);
        return;
      }

      // Coordinate of the current pixel inside a halftone cell.
      vec2 frag = vUv * uResolution;
      vec2 cell = floor(frag / uCellPx);
      vec2 centerPx = (cell + 0.5) * uCellPx;
      vec2 centerUv = centerPx / uResolution;

      vec3 sampled = texture2D(tDiffuse, centerUv).rgb;
      float l = luma(sampled);

      // Dot radius in pixels grows with luma; cap at 0.85 of half-cell.
      float halfCell = uCellPx * 0.5;
      float dotR = sqrt(clamp(l, 0.0, 1.0)) * halfCell * 0.95;

      float dist = length(frag - centerPx);

      // Smooth edge for nicer dots
      float aa = 1.0;
      float dot = smoothstep(dotR + aa, dotR - aa, dist);

      // Halftone uses the source colour but quantized via dot mask.
      vec3 dotColour = sampled * dot;

      // Mix between raw source and halftoned look
      vec3 col = mix(src.rgb, dotColour, uIntensity);

      // Radial vignette
      float v = 1.0 - length(vUv - 0.5) * uVignette;
      col *= clamp(v, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
