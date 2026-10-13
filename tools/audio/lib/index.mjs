// The audio toolkit, as handed to producers: produce(lib, ctx).
// Flat exports (lib.eq, lib.mix, lib.normalizeLufs...) plus namespaces (lib.filters.eq, lib.reverb.makeIR...).
// See docs/AUDIO.md for the guide.
export * from './buffer.mjs';
export * from './fft.mjs';
export * from './filters.mjs';
export * from './resample.mjs';
export * from './io.mjs';
export * from './edit.mjs';
export * from './loudness.mjs';
export * from './dynamics.mjs';
export * from './synth.mjs';
export * from './reverb.mjs';
export * from './analysis.mjs';
export * from './master.mjs';
export * from './vary.mjs';
export { TARGETS } from './producer.mjs';

export * as buffer from './buffer.mjs';
export * as filters from './filters.mjs';
export * as resampling from './resample.mjs';
export * as io from './io.mjs';
export * as edit from './edit.mjs';
export * as loudnessMeter from './loudness.mjs';
export * as dynamics from './dynamics.mjs';
export * as synth from './synth.mjs';
export * as space from './reverb.mjs';
export * as analysis from './analysis.mjs';
export * as master from './master.mjs';
export * as vary from './vary.mjs';
export * as paths from './paths.mjs';
