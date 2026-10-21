declare module "@strudel/web" {
  export interface StrudelOptions {
    prebake?: () => unknown;
  }
  export function initStrudel(options?: StrudelOptions): unknown;
  export function evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  export function hush(): void;
}
