# StellarWeb

A gesture-driven Three.js vignette that renders a living Saturn made from particles. Open your palm in front of the webcam to expand the rings; close your hand to condense them. The brightness of the planet breathes with its scale, and when it nears the viewport it picks up a chaotic Brownian jitter for a dramatic, cinematic feel.

## Running locally

This project is fully client-side. You can serve it with any static server; for example:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL in a modern browser that supports WebGL. Grant webcam permissions when prompted so the hand-tracking controller can read your palm.

## Features

- MediaPipe hand tracking that maps palm openness to planetary scale and dispersion.
- Particle Saturn core with Kepler-inspired orbital motion for the ring.
- Brightness modulation tied to size (small = dim, expanded = luminous).
- Chaos mode kicks in near the camera with jittery noise reminiscent of Brownian motion.
- Minimal HUD with fullscreen toggle and live gesture/brightness readouts.
