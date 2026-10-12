// Worker for the lightmap baker: pulls texel chunks from a shared atomic counter and runs a kernel.
import { parentPort, workerData } from 'node:worker_threads';
import * as K from './lightmap-trace.mjs';

K.init(workerData.shared);

parentPort.on('message', (m) => {
  try {
    if (m.cmd === 'atlases') {
      K.setAtlases(m.atlases);
      parentPort.postMessage({ ok: true });
    } else if (m.cmd === 'post') {
      K.setPost(m.job);
      parentPort.postMessage({ ok: true });
    } else if (m.cmd === 'run') {
      const counter = new Int32Array(m.counter);
      const fn = K.kernels[m.kernel];
      K.takeRayCount();
      for (;;) {
        const s = Atomics.add(counter, 0, m.chunk);
        if (s >= m.total) break;
        fn(s, Math.min(s + m.chunk, m.total), m.arg);
        Atomics.add(counter, 1, Math.min(m.chunk, m.total - s)); // done counter (progress)
      }
      parentPort.postMessage({ ok: true, rays: K.takeRayCount() });
    }
  } catch (e) {
    parentPort.postMessage({ error: e.stack || String(e) });
  }
});
