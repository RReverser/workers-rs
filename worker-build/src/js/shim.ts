/// <reference types="@cloudflare/workers-types" />

import * as imports from "./index_bg.js";
export * from "./index_bg.js";
import wasmModule from "./index.wasm";
import { WorkerEntrypoint } from "cloudflare:workers";
// top-level export from the module pulls too many unnecessary deps, use just the WASI submodule
import wasiExports from "wasi-js/dist/wasi";
import * as fs from "node:fs";
import * as path from "node:path";
$SNIPPET_JS_IMPORTS

// esbuild doesn"t understand the CommonJS<->ESM scheme
const WASI: typeof wasiExports = (wasiExports as any).default;

// Creates a TransformStream we can use to pipe our stdout to our response body.
const wasi = new WASI({
  bindings: {
    hrtime: process.hrtime.bigint,
    exit: (code: number) => {
      process.exit(code);
    },
    kill: (signal: string) => {
      throw new Error("Signals are not supported in Workers");
    },
    randomFillSync: (buf: any, offset: number, len: number) => {
      // wasi-js always passes a Uint8Array but doesn't provide precise TS, so check for future-proofing.
      if (!(buf instanceof Uint8Array)) {
        throw new TypeError("Expected a Uint8Array for randomFillSync");
      }
      return crypto.getRandomValues(buf.subarray(offset, offset + len));
    },
    isTTY: () => false,
    fs,
    path
  }
});

const instance = new WebAssembly.Instance(wasmModule, {
  "./index_bg.js": imports,
  "wasi_snapshot_preview1": wasi.wasiImport,
	$SNIPPET_WASM_IMPORTS
});

imports.__wbg_set_wasm(instance.exports);

// Run the worker's initialization function.
(instance.exports.__wbindgen_start as Function)?.();

wasi.start(instance);

export { wasmModule };

class Entrypoint extends WorkerEntrypoint {
  async fetch(request: Request) {
    let response = imports.fetch(request, this.env, this.ctx);
    $WAIT_UNTIL_RESPONSE;
    return await response;
  }

  async queue(batch: MessageBatch<unknown>) {
    return await imports.queue(batch, this.env, this.ctx);
  }

  async scheduled(controller: ScheduledController) {
    return await imports.scheduled(controller, this.env, this.ctx);
  }
}

const EXCLUDE_EXPORT = [
  "IntoUnderlyingByteSource",
  "IntoUnderlyingSink",
  "IntoUnderlyingSource",
  "MinifyConfig",
  "PolishConfig",
  "R2Range",
  "RequestRedirect",
  "fetch",
  "queue",
  "scheduled",
  "getMemory"
];

Object.entries(imports).map(([k, v]) => {
  if (!(EXCLUDE_EXPORT.includes(k) || k.startsWith("__"))) {
    (Entrypoint.prototype as any)[k] = v;
  }
});

export default Entrypoint;
