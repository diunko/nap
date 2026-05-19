// Stub for node:zlib in browser context.
// just-bash imports gunzipSync, gzipSync, constants from node:zlib.
// The browser code path uses these for gzip/gunzip commands.
// We provide minimal stubs — actual gzip decompression is handled by
// the Compression Streams API if needed, but these commands are unlikely
// to be used in the extension context.

export function gunzipSync(buf: Uint8Array): Uint8Array {
  console.warn('[zlib stub] gunzipSync called — no-op in browser');
  return buf;
}

export function gzipSync(buf: Uint8Array): Uint8Array {
  console.warn('[zlib stub] gzipSync called — no-op in browser');
  return buf;
}

export function deflateSync(buf: Uint8Array): Uint8Array {
  return buf;
}

export function inflateSync(buf: Uint8Array): Uint8Array {
  return buf;
}

export const constants = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
};

export default { gunzipSync, gzipSync, deflateSync, inflateSync, constants };
