export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
export function queue(batch: MessageBatch<unknown>, env, ctx: ExecutionContext): Promise<void>;
export function fetch(req: Request, env, ctx: ExecutionContext): Promise<Response>;
export function scheduled(controller: ScheduledController, env, ctx: ExecutionContext): Promise<void>;
global {
	const $WAIT_UNTIL_RESPONSE: void;
}
