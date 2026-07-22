# Orthographic versus tilt-shift mission frame

Status: OPEN. The orthographic frame remains the default; the tilt-shift perspective frame ships as a prototype behind the `?tiltshift` query parameter so both frames can be compared on the same contract. This decision closes only on recorded evidence, not on taste.

## Context

The stepped-yaw orthographic rig was a readability crutch the AAA art plan no longer needs. With the continuous smooth rig in place, GDD v3.0 drafts 24 and 25 ask whether the mission frame should stay orthographic or move to a low-field-of-view perspective camera at the same handler altitude with a tilt-shift focus pass. The prototype implements the perspective frame in `src/render/camera.ts` (`frame: 'tiltshift'`, `TILT_FOV`, distance matched so zoom semantics are identical) and an optional screen-height focus-band blur in `src/render/post.ts`. Pitch is fixed at handler altitude in both frames; no control path lowers the camera toward eye level.

Update 2026-07-22 (GDD v3.1): pitch is no longer fixed. It follows zoom in both frames through an eased 35-to-60-degree band (`rigPitch`), resting near 50 degrees at the default view height; the floor stays far above eye level. The tilt-shift frame's field of view widened from 15 to 50 degrees, trading the near-orthographic miniature read for a real aerial perspective, and max zoom-in rose from view height 10 to 20. The evidence checks below now compare the orthographic frame against this wide-FOV, zoom-pitched frame.

## Evidence required before closing

- [ ] Identification-law checks under full combat on the same contracts in both frames: actors, objectives, and markers must remain identifiable at combat pace (Principle V and VI), in all three palettes, on both backends.
- [ ] Depth and cinematic read via fresh-eyes review: reviewers who have not seen the build compare both frames on identical contracts and record which frame reads deeper without costing identification.
- [ ] Perf rows in `docs/perf.md` for both frames on WebGPU and the WebGL2 fallback (`?perf` and `?perf&tiltshift`), including the focus-band blur cost with post enabled.

## Outcome

To be recorded: adopt, reject, or ship as an option. Until then the orthographic frame is the default and the prototype carries no gameplay or sim impact (render-only, hash-neutral).
