import { readFileSync } from 'node:fs';
import { afterAll, expect, it, vi } from 'vitest';

afterAll(() => vi.unstubAllGlobals());

it('loads the shipped VRM through the actual plugin and retains one bounded optimised instance', async () => {
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('ProgressEvent', class { constructor(public type: string, public init: object) {} });
  // CPU loader smoke check: PNG dimensions are real, pixel decoding/upload remains a browser check.
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const bytes = await blob.arrayBuffer(), view = new DataView(bytes);
    return { width: view.getUint32(16), height: view.getUint32(20), close() {} };
  });
  vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => {
    const name = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (name.endsWith('/models/neighborhood-hero.vrm')) {
      const bytes = readFileSync(new URL('../../public/models/neighborhood-hero.vrm', import.meta.url));
      return Promise.resolve(new Response(bytes, { status: 200, headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }));
    }
    return nativeFetch(url, init);
  });
  // FileLoader constructs a Request before fetch, so give it an absolute local origin in this test.
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
    }
  });
  const { preloadHeroAvatar } = await import('./heroAsset');
  const first = await preloadHeroAvatar(), second = await preloadHeroAvatar();
  expect(first).toBe(second);
  expect(first.metrics.triangles).toBeGreaterThan(36470);
  expect(first.metrics.triangles).toBeLessThan(40000);
  expect(first.metrics.drawMeshes).toBe(17);
  expect(first.metrics.skeletons).toBe(1);
  expect(first.scale).toBeGreaterThan(1); expect(first.scale).toBeLessThan(1.2);
  expect(Object.keys(first.bones)).toHaveLength(54);
  expect(first.vrm.scene.getObjectByName('OriginalNeighbourhoodSatchel')).toBeDefined();
}, 10000);
