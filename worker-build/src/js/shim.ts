/// <reference types="@cloudflare/workers-types" />

import * as imports from "./index_bg.js";
export * from "./index_bg.js";
import wasmModule from "./index.wasm";
import { WorkerEntrypoint } from "cloudflare:workers";
$SNIPPET_JS_IMPORTS

const instantiatedPromise = (async function instantiate() {
  const importsObj: WebAssembly.Imports = {
    "./index_bg.js": imports
    $SNIPPET_WASM_IMPORTS
  };

  const needsWasi = WebAssembly.Module.imports(wasmModule).some(
    i => i.module === "wasi_snapshot_preview1"
  );

  let wasi;

  if (needsWasi) {
    // top-level export from the module pulls too many unnecessary deps, use just the WASI submodule
    const { default: Bindings } = await import(
      "../../../../wasi-fs-access/src/bindings.js"
    );

    wasi = new Bindings({
      env: process.env as Record<string, string>
    });

    await wasi.addPreOpen("/", "/");

    importsObj["wasi_snapshot_preview1"] = wasi.getWasiImports();
  }

  const { exports } = new WebAssembly.Instance(wasmModule, importsObj);

  wasi?.setExports(exports);

  imports.__wbg_set_wasm(exports);

  // Run the worker"s initialization function.
  (exports.__wbindgen_start as Function)?.();
})();

class Entrypoint extends WorkerEntrypoint {
  async fetch(request: Request) {
    let response = instantiatedPromise.then(() =>
      imports.fetch(request, this.env, this.ctx)
    );
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
