/**
 * Minimal structural stand-ins for the DOM APIs the Playwright specs evaluate
 * inside the page.
 *
 * The root tsconfig deliberately ships `lib: ["ES2022"]` with no `dom`: the
 * action itself runs in Node, and a DOM lib there would let `src/` reach for
 * `document` or other browser globals and still compile. The specs genuinely do
 * run code in a browser, so rather than widen the lib for the whole program the
 * cast is described once here, against only the surface these tests use.
 *
 * **These are types only, and that is load-bearing.** A `page.evaluate`
 * callback is serialised and re-evaluated inside the browser, where nothing
 * this file could export as a *value* exists — a helper function imported here
 * and called in a callback throws `ReferenceError` at runtime, not compile
 * time. Types are erased before serialisation, so importing them is safe.
 * Use them by casting at the top of the callback:
 *
 * ```ts
 * await page.evaluate(() => {
 *   const { document } = globalThis as unknown as ShimWindow;
 *   return document.activeElement?.tagName ?? null;
 * });
 * ```
 *
 * Add to these as specs need more; do not fall back to `any`, or the page-side
 * callbacks stop being typechecked at all — which is exactly where the
 * mistakes happen, since they never run in Node.
 */

export interface ShimElement {
  readonly id: string;
  readonly tagName: string;
  readonly tabIndex: number;
  readonly innerText: string;
  getAttribute(name: string): string | null;
  closest(selector: string): ShimElement | null;
  contains(other: ShimElement | null): boolean;
  querySelectorAll(selector: string): ArrayLike<ShimElement>;
}

export interface ShimDocument {
  readonly activeElement: ShimElement | null;
  readonly body: ShimElement;
  querySelectorAll(selector: string): ArrayLike<ShimElement>;
}

export interface ShimWindow {
  readonly document: ShimDocument;
  getComputedStyle(element: ShimElement): { readonly overflow: string };
  readonly CSS: { escape(value: string): string };
}
