# 5-Axis FDM G-code Simulator

Browser-based simulator for a custom CoreXY-BC 5-axis FDM printer. Built with Three.js, hosted on GitHub Pages.

## Architecture

Single-page app. Entry point is `index.html`. JS is split into 12 modules under `js/`. CSS under `css/`.

### JS Modules (js/)
- **gcode-parser.js** — parses G-code into move commands; handles G0/G1, fan (M106), extrusion (E axis)
- **kinematics.js** — CoreXY-BC forward kinematics; maps (X,Y,A,B,C) machine coords to world-space TCP pose
- **renderer.js** — Three.js scene setup, camera, lighting, render loop
- **machine.js** — machine geometry (bed, gantry, toolhead meshes); machine.json import/export
- **collision.js** — convex hull collision detection (SAT replaced with proper normals + edge-edge cross products); continuous checking during playback with auto-pause and red tinting
- **toolpath.js** — builds Three.js line geometry from parsed moves; extrusion coloring
- **ui.js** — desktop UI panels, controls, axis readouts
- **mobile-ui.js** — floating dock (JOG/AXES/INFO/GCODE/VIEW/COLL), slide-in drawers, touch support
- **gizmo.js** — 3D drag gizmo for collision proxy positioning; touch support included
- **collision-proxy.js** — left-side slide-in drawer for managing collision proxy objects
- **playback.js** — G-code playback engine; step/play/pause; triggers collision checks
- **utils.js** — shared math helpers

## Kinematics

**CoreXY-BC**: X/Y driven by CoreXY belt system, A=extruder, B=tilt axis (index 4), C=rotation axis (index 5).

- B tilts the toolhead relative to bed normal
- C rotates continuously (accumulated, not normalized to ±180°)
- World-space tool pose must account for B tilt when computing extrusion direction

## Key Constraints

- **No build step** — pure HTML/JS/CSS, no bundler, no npm. Must run directly in browser or via simple static server.
- **Single deployable** — GitHub Pages serves from repo root; `index.html` is the entry point.
- **Three.js via CDN** — imported via importmap or script tag, not installed locally.
- **No localStorage** — all state is in-memory during session.

## Current Branch Situation

- `main` (or single-file branch) — working deployment on GitHub Pages; monolithic single `index.html` ~4000 lines
- Modular branch — restructured into `index.html` + `css/` + `js/` (12 modules); GitHub Pages broken due to **folder case sensitivity** (e.g. `JS/` vs `js/` on Linux). Fix is pending.

When working on the modular branch, ensure all import paths use **exact lowercase** to match Linux filesystem (GitHub Pages runs on Linux).

## Collision Detection

- Uses convex hull normals + edge-edge cross products (not simple AABB or naive SAT)
- `scene.updateMatrixWorld(true)` must be called before sampling collision proxies
- Cache invalidation via `bedPoseKey()` — stale matrixWorld was a past bug, don't reintroduce
- Coordinate space for proxy drag: world→local conversion must account for parent scale

## Mastercam Post Processor Context

G-code is generated via a custom `Generic_Fanuc_5X_Mill.pst` post processor:
- C-axis is continuously accumulated (Mastercam outputs wound `p_abs` values — do NOT normalize to ±180°)
- Extrusion E values computed from NCI part-frame coords
- X-axis sign is flipped to correct kinematic frame mirror when B is tilted
- G0/G1 on every line; fan via `mr5`; retract/unretract on G0 links

## What NOT to Do

- Don't add a build system or bundler unless explicitly asked
- Don't normalize C-axis values to ±180° — accumulated C is intentional
- Don't use `sudo` for npm operations in WSL
- Don't restructure module boundaries without updating all import paths
