// What React Flow needs from the page that jsdom lacks, after React Flow's
// testing guide: a ResizeObserver that reports at once, DOMMatrixReadOnly
// for the zoom, element sizes and SVG boxes. For the board's tests only
// (vitest gives each test file its own window).

const watching = new Set<ReportingResizeObserver>();

class ReportingResizeObserver {
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.targets.add(target);
    watching.add(this);
    this.report(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    watching.delete(this);
  }

  report(target: Element): void {
    const el = target as HTMLElement;
    const contentRect = { x: 0, y: 0, width: el.offsetWidth ?? 0, height: el.offsetHeight ?? 0 };
    this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  reportAll(): void {
    for (const target of this.targets) this.report(target);
  }
}

/** Tells every observer that what it watches has changed size. */
export function reportResizes(): void {
  for (const observer of [...watching]) observer.reportAll();
}

class ScaleMatrix {
  m22: number;

  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}

/** A window of 1200 × 800 pixels unless an element says its own size. */
const px = (value: string, fallback: number) => (value.endsWith("px") ? parseFloat(value) : fallback);

export function mockReactFlow(): void {
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver = ReportingResizeObserver;
  g.DOMMatrixReadOnly = ScaleMatrix;
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return px(this.style.width, 1200);
      },
    },
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return px(this.style.height, 800);
      },
    },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}
