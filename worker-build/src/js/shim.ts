/// <reference types="@cloudflare/workers-types" />

import * as imports from "./index_bg.js";
export * from "./index_bg.js";
import wasmModule from "./index.wasm";
import { WorkerEntrypoint } from "cloudflare:workers";
import Bindings from "../../../../wasi-fs-access/src/bindings.js";
$SNIPPET_JS_IMPORTS

async function instantiate() {
  const importsObj: WebAssembly.Imports = {
    "./index_bg.js": imports,
    ...$SNIPPET_WASM_IMPORTS
  };

  const needsWasi = WebAssembly.Module.imports(wasmModule).some(
    i => i.module === "wasi_snapshot_preview1"
  );

  let wasi;

  if (needsWasi) {
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

  return wasi;
}

class Entrypoint<Env> extends WorkerEntrypoint<Env> {
  #instantiated = instantiate();

  async #wrap<I, O>(func: (arg: I, env: Env, ctx: ExecutionContext) => Promise<O>, arg: I) {
    await this.#instantiated;
    return func(arg, this.env, this.ctx);
  }

  fetch(request: Request) {
    let response = this.#wrap(imports.fetch, request);
    $WAIT_UNTIL_RESPONSE
    return response;
  }

  async queue(batch: MessageBatch<unknown>) {
    return this.#wrap(imports.queue, batch);
  }

  async scheduled(controller: ScheduledController) {
    return this.#wrap(imports.scheduled, controller);
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
