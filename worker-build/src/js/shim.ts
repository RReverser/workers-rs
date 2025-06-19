/// <reference types="@cloudflare/workers-types" />

import * as imports from "./index_bg.js";
export * from "./index_bg.js";
import wasmModule from "./index.wasm";
import { WorkerEntrypoint } from "cloudflare:workers";
$SNIPPET_JS_IMPORTS

const needsWasi = WebAssembly.Module.imports(wasmModule).some(i => i.module === "wasi_snapshot_preview1");

const instantiatedPromise = (async function instantiate() {
  const importsObj: WebAssembly.Imports = {
    "./index_bg.js": imports,
    $SNIPPET_WASM_IMPORTS
  };

  let wasi: import("wasi-js/dist/wasi").default | undefined;

  if (needsWasi) {
    // top-level export from the module pulls too many unnecessary deps, use just the WASI submodule
    const WASI = (await import("wasi-js/dist/wasi")).default;
    const fs = await import("node:fs");
    const path = await import("node:path");

    // Creates a TransformStream we can use to pipe our stdout to our response body.
    wasi = new WASI({
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

    importsObj["wasi_snapshot_preview1"] = wasi.wasiImport;
  }

  const instance = new WebAssembly.Instance(wasmModule, importsObj);

  imports.__wbg_set_wasm(instance.exports);

  // Run the worker's initialization function.
  (instance.exports.__wbindgen_start as Function)?.();

  wasi?.start(instance);
})();

class Entrypoint extends WorkerEntrypoint {
  async fetch(request: Request) {
    console.log(imports);
    let response = instantiatedPromise.then(() => imports.fetch(request, this.env, this.ctx));
    $WAIT_UNTIL_RESPONSE;
    return response;
  }

  async queue(batch: MessageBatch<unknown>) {
    await instantiatedPromise;
    return imports.queue(batch, this.env, this.ctx);
  }

  async scheduled(controller: ScheduledController) {
    await instantiatedPromise;
    return imports.scheduled(controller, this.env, this.ctx);
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
