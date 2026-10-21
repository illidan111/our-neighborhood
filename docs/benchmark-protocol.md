# Reproducible graphics comparison

Open `/?review=1` (the entry point must select `ReviewApp`). This is an explicitly synthetic graphics benchmark, **not a gameplay or input test**. It renders the production `Neighborhood` with the real Rapier world at 1/60 s, its NPC animation and weather, plus one representative crate. It never reads or writes game saves.

## Fixed conditions

- Use the same browser, machine, foreground window, power mode and Vite mode for both runs. Record these in the result report. Development React profiling is enabled; production React profiling normally reports zero.
- Browser content viewport: 1280 × 720 CSS px, 100% zoom. Review Canvas always uses DPR 1.5, perspective FOV 70°, near .05, far 180. Baseline world uses its unchanged 2048² sun shadow map.
- Allow the initial world to settle for at least 10 seconds. Capture «Площадь», «Борис крупно», «Борис сбоку», «Дом», «Гроза». For storm screenshots wait at least 8 seconds after selection. These buttons select exact camera position, look target and weather, documented in `REVIEW_POSES`. NPC idle animation is live, so its phase may vary slightly.
- Select «Площадь», wait 5 seconds and click «Замер 30 с». Keep the window focused and avoid browser screenshots or developer-tools interaction during measurement. Once complete, open JSON and save/copy the result. Repeat twice more when practical; separate first-run shader-compilation cost from subsequent warm runs.

## Route

The fixed 30-second camera path moves from the home exterior through the square to Boris, then toward the generator and bridge before returning to the square. One crate becomes kinematic in front of the moving camera at 12 s, is thrown dynamically at 18 s, and storm presentation begins at 24 s. Camera motion and the crate are scripted; the actual player controller is not attached. A state-copy update every 1.5 seconds reproduces the live checkpoint-render cadence, but no localStorage writes occur. Therefore storage costs and real input/character-controller costs must be inspected separately in live play.

## Metric meaning

- `frameMs`: intervals between rendered rAF callbacks, including browser scheduling; mean, p50, p95, p99, maximum and counts above 33.333/50 ms. These reflect this device and browser, not a promise for another computer.
- `renderSubmitCpuMs`: time inside `WebGLRenderer.render` on the CPU. This measures rendering traversal and WebGL submission, **not total frame CPU** and not GPU time.
- `physicsStepCpuMs`: elapsed CPU time from Rapier before-step to after-step callbacks, including the step and callback overhead. A display frame can contain multiple fixed physics steps.
- `drawCalls` and `triangles`: renderer counters reset immediately before rendering, with `info.autoReset=false`, thus including all shadow/main passes of that render.
- `gpuMs`: asynchronous `EXT_disjoint_timer_query_webgl2` elapsed GPU queries when supported. Disjoint samples are discarded. Unsupported is explicitly `null`, never inferred from FPS. Pending tail queries can be absent at measurement end.
- Geometry/texture counts are live renderer resource counts, not bytes of GPU memory. Body/collider counts describe the actual review physics world.
- `reactCommits` / `reactActualDurationMs`: React Profiler commits and cumulative render duration of Neighborhood when development profiling is available. React scheduling is not inferred from WebGL submission time.
- `pageVisibility`, `documentFocused`, `hiddenFrames`, `pageVisibleThroughout`: DOM visibility/focus metadata and sampled hidden-frame count. `pageVisibleThroughout` is false if any sampled frame was hidden. **Видимость DOM не гарантирует отсутствие ограничения частоты браузером.** An occluded or automated browser can throttle rAF to roughly 1 Hz even while DOM reports visible/focused. Such FPS/frame intervals are scheduling artifacts, not valid game-performance measurements. Rendering submission, draw counts and supported GPU query times can still be reported with the scheduling limitation, but must not be presented as a foreground FPS result. The original baseline JSON used the overly broad field name `frameTimingReliable` for this visibility-only proxy; that field is not evidence of reliable timing.

The diagnostic UI updates once a second. It owns the final renderer call only while mounted, and restores renderer info-reset behavior on unmount. Frame samples remain outside React state. Fixed physics timeStep and gameplay parameters are unchanged.
