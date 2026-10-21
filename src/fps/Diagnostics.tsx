import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from '@react-three/rapier';

export type Distribution = { mean: number; p50: number; p95: number; p99: number; max: number };
export type BenchmarkMetrics = {
  protocol: 'neighborhood-graphics-v1'; status: 'live' | 'running' | 'complete';
  durationSeconds: number; frames: number; frameMs: Distribution | null; fps: number | null;
  over33ms: number; over50ms: number; renderSubmitCpuMs: Distribution | null;
  physicsStepCpuMs: Distribution | null; physicsSteps: number;
  drawCalls: Distribution | null; triangles: Distribution | null;
  gpuMs: Distribution | null; gpuSamples: number; gpuTimer: string;
  viewport: { width: number; height: number; dpr: number }; renderer: string;
  bodies: number; colliders: number; geometries: number; textures: number;
  reactCommits: number; reactActualDurationMs: number;
  pageVisibility: DocumentVisibilityState; documentFocused: boolean;
  hiddenFrames: number; frameTimingReliable: boolean;
};
export type ReactMeasurements = { commits: number; durationMs: number };
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type Samples = { frame: number[]; render: number[]; physics: number[]; calls: number[]; triangles: number[]; gpu: number[] };
const freshSamples = (): Samples => ({ frame: [], render: [], physics: [], calls: [], triangles: [], gpu: [] });
const rounded = (n: number) => Math.round(n * 100) / 100;
function distribution(values: number[]): Distribution | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: rounded(values.reduce((sum, n) => sum + n, 0) / values.length), p50: rounded(sorted[Math.floor((sorted.length - 1) * .5)]), p95: rounded(sorted[Math.floor((sorted.length - 1) * .95)]), p99: rounded(sorted[Math.floor((sorted.length - 1) * .99)]), max: rounded(sorted.at(-1)!) };
}

/** Opt-in instrumentation. It owns the render call so shadow/main passes are counted together.
 * CPU render time is only WebGL submission, never an estimate of whole-frame CPU or GPU time. */
export default function Diagnostics({ run, durationSeconds = 30, onSample, onComplete, reactMeasurements }: {
  run: number; durationSeconds?: number; onSample: (metrics: BenchmarkMetrics) => void;
  onComplete?: (metrics: BenchmarkMetrics) => void;
  reactMeasurements?: { current: ReactMeasurements };
}) {
  const { gl, size } = useThree();
  const { world } = useRapier();
  const state = useRef({ samples: freshSamples(), started: 0, previous: 0, lastReport: 0, completed: false, running: false, physicsStart: 0, hiddenFrames: 0, reactStart: { commits: 0, durationMs: 0 } });
  const timer = useRef<{ context: WebGL2RenderingContext; extension: TimerExtension; pending: WebGLQuery[] } | null>(null);
  const gpuLabel = useRef('Unavailable: EXT_disjoint_timer_query_webgl2');
  const renderer = useRef('Unavailable');
  const callbacks = useRef({ onSample, onComplete }); callbacks.current = { onSample, onComplete };

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    const context = gl.getContext();
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    renderer.current = debug ? `${context.getParameter(debug.UNMASKED_VENDOR_WEBGL)} / ${context.getParameter(debug.UNMASKED_RENDERER_WEBGL)}` : String(context.getParameter(context.RENDERER));
    if ('createQuery' in context) {
      const extension = context.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
      if (extension) { timer.current = { context: context as WebGL2RenderingContext, extension, pending: [] }; gpuLabel.current = 'Asynchronous EXT_disjoint_timer_query_webgl2; disjoint samples discarded'; }
    }
    return () => {
      gl.info.autoReset = previousAutoReset;
      timer.current?.pending.forEach(query => timer.current?.context.deleteQuery(query));
      timer.current = null;
    };
  }, [gl]);

  useEffect(() => {
    const current = state.current;
    current.samples = freshSamples(); current.started = performance.now(); current.previous = 0;
    current.lastReport = 0; current.completed = false; current.running = run > 0; current.hiddenFrames = 0;
    current.reactStart = { ...(reactMeasurements?.current ?? { commits: 0, durationMs: 0 }) };
    timer.current?.pending.forEach(query => timer.current?.context.deleteQuery(query));
    if (timer.current) timer.current.pending = [];
  }, [run, reactMeasurements]);

  useBeforePhysicsStep(() => { state.current.physicsStart = performance.now(); });
  useAfterPhysicsStep(() => {
    if (!state.current.completed) state.current.samples.physics.push(performance.now() - state.current.physicsStart);
  });

  useFrame(({ scene, camera }) => {
    const current = state.current, now = performance.now();
    const measuring = !current.completed;
    if (measuring && document.visibilityState !== 'visible') current.hiddenFrames++;
    if (measuring && current.previous) current.samples.frame.push(now - current.previous);
    current.previous = now;
    const gpu = timer.current;
    if (gpu) {
      const disjoint = gpu.context.getParameter(gpu.extension.GPU_DISJOINT_EXT);
      while (gpu.pending.length && (disjoint || gpu.context.getQueryParameter(gpu.pending[0], gpu.context.QUERY_RESULT_AVAILABLE))) {
        const query = gpu.pending.shift()!;
        if (!disjoint && measuring) current.samples.gpu.push(gpu.context.getQueryParameter(query, gpu.context.QUERY_RESULT) / 1e6);
        gpu.context.deleteQuery(query);
      }
    }
    let query: WebGLQuery | null = null;
    if (gpu && measuring && gpu.pending.length < 6) {
      query = gpu.context.createQuery();
      if (query) gpu.context.beginQuery(gpu.extension.TIME_ELAPSED_EXT, query);
    }
    gl.info.reset();
    const renderStart = performance.now();
    gl.render(scene, camera);
    const renderElapsed = performance.now() - renderStart;
    if (query && gpu) { gpu.context.endQuery(gpu.extension.TIME_ELAPSED_EXT); gpu.pending.push(query); }
    if (measuring) {
      current.samples.render.push(renderElapsed);
      current.samples.calls.push(gl.info.render.calls);
      current.samples.triangles.push(gl.info.render.triangles);
    }
    const elapsed = (now - current.started) / 1000;
    const finish = current.running && !current.completed && elapsed >= durationSeconds;
    if (measuring && (finish || now - current.lastReport >= 1000)) {
      current.lastReport = now;
      const sample = current.samples;
      const metrics: BenchmarkMetrics = {
        protocol: 'neighborhood-graphics-v1', status: finish ? 'complete' : current.running ? 'running' : 'live',
        durationSeconds: rounded(elapsed), frames: sample.frame.length, frameMs: distribution(sample.frame),
        fps: sample.frame.length ? rounded(1000 * sample.frame.length / sample.frame.reduce((sum, n) => sum + n, 0)) : null,
        over33ms: sample.frame.filter(ms => ms > 33.333).length, over50ms: sample.frame.filter(ms => ms > 50).length,
        renderSubmitCpuMs: distribution(sample.render), physicsStepCpuMs: distribution(sample.physics), physicsSteps: sample.physics.length,
        drawCalls: distribution(sample.calls), triangles: distribution(sample.triangles),
        gpuMs: distribution(sample.gpu), gpuSamples: sample.gpu.length, gpuTimer: gpuLabel.current,
        viewport: { width: size.width, height: size.height, dpr: gl.getPixelRatio() }, renderer: renderer.current,
        bodies: world.bodies.len(), colliders: world.colliders.len(), geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        reactCommits: (reactMeasurements?.current.commits ?? 0) - current.reactStart.commits,
        reactActualDurationMs: rounded((reactMeasurements?.current.durationMs ?? 0) - current.reactStart.durationMs),
        pageVisibility: document.visibilityState, documentFocused: document.hasFocus(),
        hiddenFrames: current.hiddenFrames, frameTimingReliable: current.hiddenFrames === 0 && document.visibilityState === 'visible',
      };
      callbacks.current.onSample(metrics);
      if (finish) { current.completed = true; callbacks.current.onComplete?.(metrics); }
      // Idle instrumentation stays bounded; measured runs always retain the full 30 seconds.
      if (!current.running && elapsed > 10) { current.samples = freshSamples(); current.started = now; current.hiddenFrames = 0; }
    }
  }, 1);
  return null;
}
