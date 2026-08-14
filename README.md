# Shri Ram Mandir — Sacred Walkthrough

A Three.js/Vite walkthrough built around the supplied `Full combined_Ram Temple_LQ.STL` source model.

## Run

```bash
npm install
npm run dev
```

For production:

```bash
npm run build
npm run preview
```

## Full-fidelity lossless temple streaming

The temple is **not decimated or reduced** in this build.

The original source contains approximately **1,506,583 triangles**. Those original triangle records have been partitioned losslessly into 17 streamable STL files under `public/models/full-stream/`. The manifest confirms that all 1,506,583 source triangles are assigned exactly once. No vertex clustering, triangle dropping, simplification or normal regeneration is performed during the partitioning step.

The partitioning is component-aware: connected architectural shells are kept intact, and large continuous structural components are placed in an always-resident global chunk. The runtime then uses a location-aware streaming strategy:

- Large connected structural components and the upper architectural tier remain resident so shikhara, long continuous surfaces and upper silhouettes do not appear cut.
- From the outer approach, the complete middle architectural tier is also resident so the temple elevation remains visually complete.
- Lower architectural bands load around the visitor with a generous two-band guard region.
- An extra band is prefetched in the visitor's current viewing direction.
- Loaded chunks are cached for the rest of the session, so returning or turning back does not require a re-download.
- BVH collision trees are built lazily only for nearby lower/middle chunks. Distant upper geometry is not given an expensive collision BVH unless it becomes physically relevant.
- STL decoding is concurrency-limited to avoid CPU and memory spikes on simpler computers.
- Darshan/overview mode explicitly loads the complete lossless temple before moving the orbit camera, preventing streamed section boundaries from appearing in wide views.

This strategy prioritizes architectural fidelity over aggressive mesh reduction. Performance comes from spatial streaming, chunk-level frustum culling, adaptive render resolution, reduced shadow cost, throttled secondary effects, and location-limited collision work.

## Navigation and collision

- Z-up Street-View-style walk camera.
- **W / Up Arrow** — move forward.
- **S / Down Arrow** — move backward.
- **A / Left Arrow** — turn left in place.
- **D / Right Arrow** — turn right in place.
- **Left-mouse drag** — horizontal yaw and vertical pitch; no roll.
- **Mouse wheel** — field-of-view zoom without moving through geometry.
- Capsule/BVH collision covers the streamed temple geometry and the outer precinct geometry.
- Platforms, stairs, walls, columns, compound walls, gates and other architectural masses participate in collision.
- A modest step-assist helps negotiate architectural stairs.

## Sacred experience systems

- Navigation-aware zones: approach, stairs, entrance platform, mandapa, side halls, pradakshina paths, inner hall, sanctum approach and sacred core.
- Optional pilgrimage progression and pradakshina recognition.
- English/Hindi narration and zone-aware procedural devotional ambience.
- Morning, noon, Aarti/evening and night lighting profiles.
- Dedicated interior lighting and warmer sanctum-axis illumination.
- Contextual information markers appear only when the visitor approaches the relevant area.
- Silence Mode and contemplative stillness interactions reduce digital intrusion near the sacred core.
- The Garbhgrih image is positioned at a source-mesh floor height sampled from the unreduced STL, so it is not anchored to the shikhar surface.

## Precinct and landscape

The parkota/outer compound is a modular reconstruction based on the supplied reference image rather than an unverified third-party model. It includes:

- open primary gateway and east-side secondary gateway
- articulated perimeter walls and buttresses
- corner pavilion/shrine masses
- inner colonnades
- stone processional paths
- lawns, hedges and landscape clusters
- approach lamps and night lighting
- skydome, distant tree line and horizon landforms

Major precinct architecture is collision-aware; decorative planting is mostly non-blocking.

## Performance modes

**Performance** is the default for older laptops and integrated graphics. It lowers render pixel density, reduces expensive shadows and secondary atmosphere, and uses an adaptive frame-rate governor. **Balanced** restores higher resolution and stronger shadow quality on more capable hardware.

The full temple geometry remains lossless in both modes; the quality switch does not substitute a reduced temple mesh.

## Curatorial note

The included interpretive text is a functional demonstration. Temple-specific historical, ritual, iconographic and Sanskrit content should be replaced or verified using material approved by the relevant temple/institutional authority.

## Model axis and bounds

The supplied temple is treated as Z-up with approximate source bounds:

- X: -78.74 to +78.74
- Y: -120.94 to +128.78
- Z: 0 to +104.32

The default visitor begins near the negative-Y approach.

## Walk Mode named locations

Walk Mode includes a `Locations` navigator with 18 curated stops:

1. Main Gate
2. Outer Forecourt
3. Temple Approach
4. Sacred Ascent
5. Entrance Platform
6. Mandapa Forecourt
7. Main Mandapa
8. East Pillared Hall
9. West Pillared Hall
10. Inner Processional Axis
11. East Pradakshina
12. West Pradakshina
13. Inner Hall
14. Sanctum Approach
15. Darshan Threshold
16. Garbhgrih Darshan
17. East Parkota Walk
18. North Precinct

Selecting a stop does not abruptly teleport the viewer. The app first preloads the full-fidelity stream bands required by the route, then moves the visitor with a smootherstep-eased, ground-following camera transition. Architectural branches use shared route hubs so transitions prefer meaningful circulation paths instead of drawing a direct line through temple masses. Manual Walk Mode controls resume automatically on arrival. Press `Esc` during a transition to cancel it.
