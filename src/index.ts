import * as puppeteer from 'puppeteer';
import * as createDebug from 'debug';

const debug = createDebug('puppeteerUtils');

export type Brand<K, T> = K & { __brand: T };

export interface TRect {
  left: number;
  top: number;
  width: number;
  height: number;
  area: number;
  ratio: number;
}
export type TViewportRect = Brand<TRect, 'TViewportRect'>;
export type TPageRect = Brand<TRect, 'TPageRect'>;

export interface TVector2 {
  x: number;
  y: number;
}
export type TViewportPoint = Brand<TVector2, 'TViewportPoint'>;
export type TPagePoint = Brand<TVector2, 'TPagePoint'>;
export type TDimensions = Brand<TVector2, 'TDimensions'>;

export interface TPageElementsScan {
  pageElements: TPageElement[];
  version: number;
}

export interface TPageElement {
  pageElementsScanRef: TPageElementsScan | null;
  nodeName: string;
  classArray: string[];
  attributes: { [key: string]: any };
  xpath: string;
  isImage: boolean;
  isInteractive: boolean;
  text: string;
  textNormalized: string;
  domDepth: number;
  zIndex: number;
  viewportRect: TViewportRect;
  centerViewportPoint: TViewportPoint;
  centerLeftViewportPoint: TViewportPoint;
  centerRightViewportPoint: TViewportPoint;
  pageRect: TPageRect;
  centerPagePoint: TPagePoint;
  centerLeftPagePoint: TPagePoint;
  centerRightPagePoint: TPagePoint;
}

export type TPageElementsFinder = (pageElements: TPageElement[]) => TPageElement[];

export type TPageElementsFilter = (pageElement: TPageElement) => boolean;

export interface TBrowserModel {
  browser: puppeteer.Browser;
  browserSize: TDimensions;
  viewportSize: TDimensions;
}

export interface TPageModel {
  browserModel: TBrowserModel;
  page: puppeteer.Page;
  pageElementsScan: TPageElementsScan | null;
  mouseViewportPoint: TViewportPoint;
  mousePagePoint: TPagePoint;
  pageScrollPagePoint: TPagePoint;
  viewportSize: TDimensions;
  windowInnerSize: TDimensions;
  windowScrollSize: TDimensions;
  update(fn?: () => Partial<TPageModel>): Promise<void>;
}

export function annotate<T extends Function>(fn: T, ctx: any): T {
  const oldToString = fn.toString;
  fn.toString = () =>
    `${typeof ctx === 'string' ? ctx + '\n' : ctx ? JSON.stringify(ctx) + '\n' : ''}` +
    `${oldToString.call(fn)}`;
  return fn;
}

export function nowDateIso() {
  return new Date()
    .toISOString()
    .replace(/\..*/, '')
    .replace(/[^0-9]/g, '');
}

export function normalizeText(text: string): string {
  return String(text || '')
    .replace(/(^\s+|\s+$)/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function makeScreenshotFilename(message?: string) {
  let suffixForFilename = '';
  if (message) {
    const messageForFilename = ((/^[^\n]+/.exec(message) || [])[0] || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .substr(0, 50);

    if (messageForFilename) {
      suffixForFilename = '-' + messageForFilename;
    }
  }
  return 'screenshot-' + nowDateIso() + suffixForFilename + '.png';
}

export async function takeScreenshot(
  pageModel: TPageModel,
  message?: string,
): Promise<string | null> {
  if (!process.env.WITH_SCREENSHOTS) {
    return null;
  }
  const screenshotPath = './' + makeScreenshotFilename(message);
  await pageModel.page.screenshot({
    path: screenshotPath,
  });
  return screenshotPath;
}

export async function debugDelay(pageModel: TPageModel, delayMs: number) {
  if (process.env.WITH_DEBUG_DELAYS) {
    await pageModel.page.waitFor(delayMs);
  }
}

export function calcVectorSum<T extends TVector2>(a: T, b: T | TDimensions): T {
  return { x: a.x + b.x, y: a.y + b.y } as T;
}

export function calcVectorDiff<T extends TVector2>(a: T, b: T): TDimensions {
  return { x: a.x - b.x, y: a.y - b.y } as TDimensions;
}

export function calcVectorMulScalar<T extends TVector2>(a: T, b: TVector2): T {
  return { x: a.x * b.x, y: a.y * b.y } as T;
}

export function calcVectorDistance<T extends TVector2>(a: T, b: T): number {
  const dv = calcVectorDiff(b, a);
  const d = dv.x * dv.x + dv.y * dv.y;
  return Math.sqrt(d);
}

export function calcRectCenter<T extends TRect>(rect: T): TVector2 {
  return { x: rect.left + 0.5 * rect.width, y: rect.top + 0.5 * rect.height } as TVector2;
}

export function makeRectFromPoint<T extends TVector2>(point: T): TRect {
  return {
    left: point.x,
    top: point.x,
    width: 1,
    height: 1,
    area: 1,
    ratio: 1,
  };
}

export function calcRectShift<T extends TRect>(a: T, b: T) {
  const pointsA: TVector2[] = [
    { x: a.left, y: a.top },
    { x: a.left + a.width, y: a.top },
    { x: a.left, y: a.top + a.height },
    { x: a.left + a.width, y: a.top + a.height },
    calcRectCenter(a),
  ];
  const pointsB: TVector2[] = [
    { x: b.left, y: b.top },
    { x: b.left + b.width, y: b.top },
    { x: b.left, y: b.top + b.height },
    { x: b.left + b.width, y: b.top + b.height },
    calcRectCenter(b),
  ];
  const shiftDiffs: TDimensions[] = pointsA.map((a, i) => {
    const b = pointsB[i];
    return calcVectorDiff(b, a);
  });
  const shiftDistances: number[] = shiftDiffs.map((diff) => {
    return calcVectorDistance({ x: 0, y: 0 }, diff);
  });
  let averageShift = 0;
  let minShift = Number.POSITIVE_INFINITY;
  let maxShift = Number.NEGATIVE_INFINITY;
  shiftDistances.forEach((d) => {
    averageShift += d;
    if (d > maxShift) {
      maxShift = d;
    }
    if (d < minShift) {
      minShift = d;
    }
  });
  averageShift /= shiftDiffs.length;
  return {
    pointsA,
    pointsB,
    shiftDiffs,
    shiftDistances,
    averageShift,
    minShift,
    maxShift,
    isMoved: averageShift - minShift < 0.0001 && averageShift - maxShift < 0.0001,
  };
}

// https://stackoverflow.com/a/26178015
export function calcRectDistance(a: TRect, b: TRect): number {
  const { left: x1, top: y1 } = a;
  const x1b = x1 + a.width;
  const y1b = y1 + a.height;

  const { left: x2, top: y2 } = b;
  const x2b = x2 + b.width;
  const y2b = y2 + b.height;

  const left = x2b < x1;
  const right = x1b < x2;
  const bottom = y2b < y1;
  const top = y1b < y2;
  if (top && left) {
    return calcVectorDistance({ x: x1, y: y1b }, { x: x2b, y: y2 });
  } else if (left && bottom) {
    return calcVectorDistance({ x: x1, y: y1 }, { x: x2b, y: y2b });
  } else if (bottom && right) {
    return calcVectorDistance({ x: x1b, y: y1 }, { x: x2, y: y2b });
  } else if (right && top) {
    return calcVectorDistance({ x: x1b, y: y1b }, { x: x2, y: y2 });
  } else if (left) {
    return x1 - x2b;
  } else if (right) {
    return x2 - x1b;
  } else if (bottom) {
    return y1 - y2b;
  } else if (top) {
    return y2 - y1b;
  } else {
    // rectangles intersect
    return 0;
  }
}

const debug_convertPagePointToViewportPoint = createDebug(
  'puppeteerUtils:convertPagePointToViewportPoint',
);
export function convertPagePointToViewportPoint(
  pageModel: TPageModel,
  pagePoint: TPagePoint,
): TViewportPoint {
  const viewportPoint = calcVectorDiff(
    pagePoint as TVector2,
    pageModel.pageScrollPagePoint as TVector2,
  );
  debug_convertPagePointToViewportPoint(
    pagePoint,
    pageModel.pageScrollPagePoint,
    '->',
    viewportPoint,
  );
  return (viewportPoint as any) as TViewportPoint;
}

export function isViewportPointOutOfViewport(
  pageModel: TPageModel,
  viewportPoint: TViewportPoint,
): boolean {
  return (
    viewportPoint.x < 0 ||
    viewportPoint.x > pageModel.viewportSize.x ||
    viewportPoint.y < 0 ||
    viewportPoint.y > pageModel.viewportSize.y
  );
}

export function convertElementToSerializable(element: TPageElement): { [key: string]: any } {
  return {
    ...element,
    pageElementsScanRef: null,
  };
}

export function debugToStringElement(element: TPageElement): string {
  return (
    `<${element.nodeName}>` +
    ` "${element.text}"` +
    ` classArray:${element.classArray}` +
    ` pageRect:${JSON.stringify(element.pageRect)}` +
    ` viewportRect:${JSON.stringify(element.viewportRect)}`
  );
}

let _pageElementsScanVersion = 0;
function getColorForPageElementsVersion(version: number) {
  const colors = [
    'rgba(255,0,255,0.5)',
    'rgba(255,0,0,0.5)',
    'rgba(0,100,200,0.5)',
    'rgba(0,0,255,0.5)',
  ];

  return colors[version % colors.length];
}

export async function addMouseCursorOverlay(pageModel: TPageModel): Promise<void> {
  await pageModel.page.evaluate(
    (
      mouseViewportPoint: TViewportPoint,
      mousePagePoint: TPagePoint,
      WITH_DEBUG_OVERLAYS: boolean,
    ) => {
      const container = document.createElement('div');
      container.classList.add('__puppeteer_mouse_container__');
      const box = document.createElement('div');
      box.classList.add('__puppeteer_mouse__');
      const styleElement = document.createElement('style');
      styleElement.innerHTML = `
  .__puppeteer_mouse_container__ {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99999999;
    pointer-events: none;
    overflow: hidden;
  }
  .__puppeteer_mouse__ {
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    background: rgba(255,255,0,.4);
    border: 1px solid white;
    border-radius: 10px;
    margin-left: -10px;
    margin-top: -10px;
    transition: background .2s, border-radius .2s, border-color .2s;
    font-size: 9px;
    line-height: 9px;
    overflow: visible;
    color: #000000;
    text-shadow: 1px 1px 2px #ffffff;
  }
  .__puppeteer_mouse__.button-1 {
    transition: none;
    background: rgba(0,0,0,0.9);
  }
  .__puppeteer_mouse__.button-2 {
    transition: none;
    border-color: rgba(0,0,255,0.9);
  }
  .__puppeteer_mouse__.button-3 {
    transition: none;
    border-radius: 4px;
  }
  .__puppeteer_mouse__.button-4 {
    transition: none;
    border-color: rgba(255,0,0,0.9);
  }
  .__puppeteer_mouse__.button-5 {
    transition: none;
    border-color: rgba(0,255,0,0.9);
  }
  `;
      function updateCoords(viewportPoint: TViewportPoint, pagePoint: TPagePoint) {
        box.style.left = `${viewportPoint.x}px`;
        box.style.top = `${viewportPoint.y}px`;
        if (WITH_DEBUG_OVERLAYS) {
          box.innerText =
            `${viewportPoint.x.toFixed(4)};${viewportPoint.y.toFixed(4)}` +
            `|${pagePoint.x.toFixed(4)};${pagePoint.y.toFixed(4)}`;
        }
      }
      function updateButtons(buttons: number) {
        for (let i = 0; i < 5; i++) {
          box.classList.toggle('button-' + i, Boolean(buttons & (1 << i)));
        }
      }
      window.__puppeteer_mouse_updatecoords__ = updateCoords;
      document.head.appendChild(styleElement);
      container.appendChild(box);
      document.body.appendChild(container);
      document.addEventListener(
        'mousemove',
        (event) => {
          const pagePoint = {
            x: event.pageX,
            y: event.pageY,
          } as TPagePoint;
          const viewportPoint = {
            x: event.clientX,
            y: event.clientY,
          } as TViewportPoint;
          updateCoords(viewportPoint, pagePoint);
          updateButtons(event.buttons);
        },
        true,
      );
      document.addEventListener(
        'mousedown',
        (event) => {
          updateButtons(event.buttons);
          box.classList.add('button-' + event.which);
        },
        true,
      );
      document.addEventListener(
        'mouseup',
        (event) => {
          updateButtons(event.buttons);
          box.classList.remove('button-' + event.which);
        },
        true,
      );
      updateCoords(mouseViewportPoint, mousePagePoint);
    },
    pageModel.mouseViewportPoint,
    pageModel.mousePagePoint,
    pageModel.pageScrollPagePoint,
    !!process.env.WITH_DEBUG_OVERLAYS,
  );
}

export async function renderMouseCursor(pageModel: TPageModel): Promise<void> {
  await pageModel.page.evaluate(
    (mouseViewportPoint: TViewportPoint, mousePagePoint: TPagePoint) => {
      const updateCoords = window.__puppeteer_mouse_updatecoords__;
      if (updateCoords) {
        updateCoords(mouseViewportPoint, mousePagePoint);
      }
    },
    pageModel.mouseViewportPoint,
    pageModel.mousePagePoint,
  );
}

export async function addPageElementsChangeObservers(pageModel: TPageModel): Promise<void> {
  await pageModel.page.exposeFunction('__puppeteer_ondomchange__', async () => {
    try {
      await pageModel.update();
    } catch (ex) {
      // IGNORE_EXCEPTION
    }
  });
  await pageModel.page.evaluate(() => {
    function throttle(callback: Function, limit: number) {
      let wait = false;
      let timer: number;
      return function() {
        if (!wait) {
          wait = true;
          callback();
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            wait = false;
            callback();
          }, limit);
        }
      };
    }
    const handler = throttle(window.__puppeteer_ondomchange__, 20);
    const observers: MutationObserver[] = [];
    const rootEls = document.querySelectorAll('body > *');
    for (let i = 0; i < rootEls.length; ++i) {
      const rootEl = rootEls.item(i);
      if (/^__puppeteer_/.test(rootEl.className)) {
        continue;
      }
      const observer = new MutationObserver(handler);
      observer.observe(rootEl, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      observers.push(observer);
    }
    window.addEventListener('scroll', handler, true);
    let handlerRepeatTimer: number;
    function handlerRepeat() {
      handler();
      handlerRepeatTimer = window.setTimeout(handlerRepeat, 500);
    }
    handlerRepeat();
    window.addEventListener('beforeunload', () => {
      observers.forEach((observer) => {
        observer.disconnect();
      });
      observers.length = 0;
      window.removeEventListener('scroll', handler, true);
      window.clearTimeout(handlerRepeatTimer);
    });
  });
}

async function addPageElementsOverlay(pageModel: TPageModel): Promise<void> {
  await pageModel.page.evaluate(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
  .__puppeteer_boxes_container__ {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99999999;
    pointer-events: none;
    overflow: hidden;
  }
  .__puppeteer_box__ {
    position: absolute;
    pointer-events: none;
    border: 1px solid transparent;
    color: transparent;
    font-size: 9px;
    font-weight: bold;
    line-height: 9px;
    overflow: hidden;
  }
`;
    document.head.appendChild(styleElement);
  });
}

async function renderPageElementsScan(
  pageModel: TPageModel,
  pageElementsScan: TPageElementsScan,
  color?: string,
): Promise<void> {
  if (process.env.WITH_DEBUG_OVERLAYS) {
    await pageModel.page.evaluate(
      (pageElements: TPageElement[], color: string) => {
        if (!document.querySelector('[__puppeteer_boxes_css__]')) {
          const styleElement = document.createElement('style');
          styleElement.setAttribute('__puppeteer_boxes_css__', '1');
          styleElement.innerHTML = `
  .__puppeteer_boxes__ {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99999999;
    pointer-events: none;
    overflow: hidden;
  }
  .__puppeteer_box__ {
    position: absolute;
    pointer-events: none;
    border: 1px solid transparent;
    color: transparent;
    font-size: 9px;
    font-weight: bold;
    line-height: 9px;
    overflow: hidden;
  }
`;
          document.head.appendChild(styleElement);
        }

        const boxesExisting: HTMLElement | null = document.querySelector('.__puppeteer_boxes__');
        if (boxesExisting && boxesExisting.parentNode) {
          boxesExisting.parentNode.removeChild(boxesExisting);
        }
        const boxes = document.createElement('div');
        boxes.className = '__puppeteer_boxes__';
        boxes.style.pointerEvents = 'none';
        pageElements.forEach(({ viewportRect, zIndex, text }, index) => {
          const box = document.createElement('div');
          box.className = '__puppeteer_box__';
          box.style.left = `${viewportRect.left}px`;
          box.style.top = `${viewportRect.top}px`;
          box.style.zIndex = `${index + 1}`;
          box.style.width = `${viewportRect.width}px`;
          box.style.height = `${viewportRect.height}px`;
          box.style.borderColor = color;
          box.style.color = color;
          box.innerText = `x:${viewportRect.left}|y:${viewportRect.top}|z:${zIndex}|text:${text}`;
          boxes.appendChild(box);
        });
        document.body.appendChild(boxes);
      },
      pageElementsScan.pageElements.map((el) => convertElementToSerializable(el)),
      color || getColorForPageElementsVersion(pageElementsScan.version),
    );
  }
}

export async function scanPageElements(pageModel: TPageModel): Promise<TPageElementsScan> {
  const selector =
    'a, button, label, span, div, p, li, dt, dd, h1, h2, h3, h4, h5, h6, img, svg, input, [tabindex], [role]';
  await pageModel.page.waitForSelector(selector);
  const pageElements = (await pageModel.page.evaluate(
    (selector: string) => {
      const allNodes = Array.from(document.body.querySelectorAll(selector));

      // NOTE(@sompylasar): The below functions are defined in the browser context, cannot reuse those from above.
      function normalizeText(text: string): string {
        return String(text || '')
          .replace(/(^\s+|\s+$)/g, '')
          .replace(/\s+/g, ' ')
          .toLowerCase();
      }

      function getText(el: HTMLElement): string {
        return ['aria-label', 'alt', 'innerText', 'placeholder', 'title', 'href'].reduce(
          (accu, attr) => {
            const attrValue = attr === 'innerText' ? el.innerText : el.getAttribute(attr);
            return accu || !attrValue
              ? accu
              : attr === 'innerText' ? attrValue : `@${attr}@${attrValue}`;
          },
          '',
        );
      }

      function checkIsImage(el: HTMLElement): boolean {
        return ['img', 'svg'].indexOf(el.nodeName.toLowerCase()) >= 0;
      }

      function checkIsInteractive(el: HTMLElement): boolean {
        return (
          ['a', 'button', 'input'].indexOf(el.nodeName.toLowerCase()) >= 0 ||
          (el.getAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') ||
          [
            'alert',
            'alertdialog',
            'button',
            'checkbox',
            'dialog',
            'link',
            'menuitem',
            'menuitemcheckbox',
            'menuitemradio',
            'option',
            'radio',
            'scrollbar',
            'slider',
            'spinbutton',
            'tab',
            'textbox',
          ].indexOf(el.getAttribute('role') || '') >= 0
        );
      }

      // https://stackoverflow.com/a/2631931/1346510
      function getXPathTo(element: HTMLElement): string {
        if (element.id !== '') {
          return 'id("' + element.id + '")';
        }
        if (element === document.body) {
          return element.tagName;
        }
        if (!element.parentNode) {
          return '';
        }

        let ix = 0;
        const siblings = element.parentNode.childNodes;
        const ic = siblings.length;
        for (let i = 0; i < ic; i++) {
          const sibling = siblings[i] as HTMLElement;
          if (sibling === element) {
            return (
              getXPathTo(element.parentNode as HTMLElement) +
              '/' +
              element.tagName +
              '[' +
              (ix + 1) +
              ']'
            );
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }

        return '';
      }

      function makeCenterPointFromRect(rect: TRect): TVector2 {
        return { x: rect.left + 0.5 * rect.width, y: rect.top + 0.5 * rect.height } as TVector2;
      }
      function makeCenterLeftPointFromRect(rect: TRect): TVector2 {
        return { x: rect.left + 0.1 * rect.width, y: rect.top + 0.5 * rect.height } as TVector2;
      }
      function makeCenterRightPointFromRect(rect: TRect): TVector2 {
        return { x: rect.left + 0.9 * rect.width, y: rect.top + 0.5 * rect.height } as TVector2;
      }

      function getElementTopLeftPagePoint(sourceElement: HTMLElement): TPagePoint {
        let x = 0;
        let y = 0;
        let el = sourceElement;
        while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
          x += el.offsetLeft - el.scrollLeft;
          y += el.offsetTop - el.scrollTop;
          el = el.offsetParent as HTMLElement;
        }
        return { x: x, y: y } as TPagePoint;
      }

      // NOTE(@sompylasar): Copy-paste from `calcRectDistance`.
      function calcRectIntestects<T extends TRect>(a: T, b: T): boolean {
        const { left: x1, top: y1 } = a;
        const x1b = x1 + a.width;
        const y1b = y1 + a.height;

        const { left: x2, top: y2 } = b;
        const x2b = x2 + b.width;
        const y2b = y2 + b.height;

        const left = x2b < x1;
        const right = x1b < x2;
        const bottom = y2b < y1;
        const top = y1b < y2;
        return !left && !right && !bottom && !top;
      }

      function isInvisible(style: CSSStyleDeclaration): boolean {
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          (style.opacity !== null && parseFloat(style.opacity) < 0.01)
        );
      }

      let domDepthMax = 0;
      let pageElements: TPageElement[] = allNodes
        .filter(
          (el: HTMLElement): boolean =>
            !(
              el.classList.contains('__puppeteer_boxes__') ||
              el.classList.contains('__puppeteer_box__') ||
              el.classList.contains('__puppeteer_mouse__')
            ),
        )
        .map((el: HTMLElement): TPageElement | null => {
          const isImage = checkIsImage(el);
          const isInteractive = checkIsInteractive(el);
          if (!isImage && !isInteractive && el.firstElementChild) {
            return null;
          }

          const viewportRectFromDom = el.getBoundingClientRect();
          const area = viewportRectFromDom.width * viewportRectFromDom.height;
          if (area < 1) {
            return null;
          }

          const computedStyle = window.getComputedStyle(el);
          let invisible = isInvisible(computedStyle);
          if (invisible) {
            return null;
          }

          let domDepth = 0;
          let zIndex = 0;
          let parentNode: HTMLElement | null = el;
          while (parentNode) {
            ++domDepth;
            try {
              const style = parentNode === el ? computedStyle : window.getComputedStyle(parentNode);
              if (isInvisible(style)) {
                invisible = true;
                break;
              }
              const zIndexCss = parseInt(style.zIndex || '', 10) || 0;
              if (zIndexCss > zIndex) {
                zIndex = zIndexCss;
              }
            } catch (ex) {
              // IGNORE_EXCEPTION
            }
            parentNode = parentNode.parentNode as HTMLElement | null;
          }
          if (invisible) {
            return null;
          }

          if (domDepth > domDepthMax) {
            domDepthMax = domDepth;
          }

          const text = getText(el);

          const ratio =
            viewportRectFromDom.height > 0
              ? viewportRectFromDom.width / viewportRectFromDom.height
              : 1;

          const viewportRect: TViewportRect = {
            left: viewportRectFromDom.left,
            top: viewportRectFromDom.top,
            width: viewportRectFromDom.width,
            height: viewportRectFromDom.height,
            area: area,
            ratio: ratio,
          } as TViewportRect;

          const pagePointFromDom = getElementTopLeftPagePoint(el);

          const pageRect: TPageRect = {
            left: pagePointFromDom.x,
            top: pagePointFromDom.y,
            width: viewportRectFromDom.width,
            height: viewportRectFromDom.height,
            area: area,
            ratio: ratio,
          } as TPageRect;

          const classArray: string[] = [];
          for (let i = 0; i < el.classList.length; ++i) {
            classArray.push(el.classList.item(i));
          }

          const attributes: { [key: string]: any } = {};
          for (let i = 0; i < el.attributes.length; ++i) {
            const attribute = el.attributes.item(i);
            attributes[attribute.name] = attribute.value;
          }

          const element: TPageElement = {
            pageElementsScanRef: null,
            nodeName: el.nodeName.toLowerCase(),
            classArray: classArray,
            attributes: attributes,
            xpath: getXPathTo(el),
            isImage: isImage,
            isInteractive: isInteractive,
            text: text,
            textNormalized: normalizeText(text),
            domDepth: domDepth,
            zIndex: zIndex,
            viewportRect: viewportRect,
            centerViewportPoint: makeCenterPointFromRect(viewportRect) as TViewportPoint,
            centerLeftViewportPoint: makeCenterLeftPointFromRect(viewportRect) as TViewportPoint,
            centerRightViewportPoint: makeCenterRightPointFromRect(viewportRect) as TViewportPoint,
            pageRect: pageRect,
            centerPagePoint: makeCenterPointFromRect(pageRect) as TPagePoint,
            centerLeftPagePoint: makeCenterLeftPointFromRect(pageRect) as TPagePoint,
            centerRightPagePoint: makeCenterRightPointFromRect(pageRect) as TPagePoint,
          };

          return element;
        })
        .filter(Boolean)
        .map((pageElement: TPageElement) => {
          return Object.assign({}, pageElement, {
            domDepth: domDepthMax > 0 ? (domDepthMax - pageElement.domDepth) / domDepthMax : 0,
          });
        });

      pageElements.sort((a: TPageElement, b: TPageElement) => {
        return a.zIndex - b.zIndex !== 0
          ? -(a.zIndex - b.zIndex)
          : a.viewportRect.top - b.viewportRect.top !== 0
            ? a.viewportRect.top - b.viewportRect.top
            : a.viewportRect.left - b.viewportRect.left !== 0
              ? a.viewportRect.left - b.viewportRect.left
              : -(a.viewportRect.area - b.viewportRect.area);
      });

      pageElements = pageElements.filter(
        (a) =>
          a.viewportRect.left < window.innerWidth &&
          a.viewportRect.top < window.innerHeight &&
          a.viewportRect.left + a.viewportRect.width > 0 &&
          a.viewportRect.top + a.viewportRect.height > 0,
      );

      pageElements = pageElements.filter(
        (a, i) =>
          !pageElements.some(
            (b, j) =>
              j < i && b.zIndex > a.zIndex && calcRectIntestects(b.viewportRect, a.viewportRect),
          ),
      );

      return pageElements;
    },
    selector,
    !!process.env.WITH_DEBUG_OVERLAYS,
  )) as TPageElement[];

  const pageElementsScan = {
    pageElements: pageElements,
    version: ++_pageElementsScanVersion,
  };

  pageElementsScan.pageElements.forEach((el) => {
    el.pageElementsScanRef = pageElementsScan;
  });

  return pageElementsScan;
}

export interface TPageElementContextItem {
  pageElement: TPageElement;
  distance: number;
}
export interface TPageElementContext {
  sourceElement: TPageElement;
  contextItems: TPageElementContextItem[];
}

export function debugToStringElementContext(ctx: TPageElementContext): string {
  let log = '';
  log += `context : "${ctx.sourceElement.text}" ${ctx.sourceElement.classArray}\n`;
  ctx.contextItems.forEach((ctxItem) => {
    const el = ctxItem.pageElement;
    log += `     ${ctxItem.distance} ${debugToStringElement(el)}\n`;
  });
  return log;
}

const debug_getElementContext = createDebug('puppeteerUtils:getElementContext');
export function getElementContext(sourceElement: TPageElement): TPageElementContext {
  const pageElementsScan = sourceElement.pageElementsScanRef;
  let withContext = (pageElementsScan ? pageElementsScan.pageElements : [])
    .filter((el) => el !== sourceElement)
    .map((el: TPageElement) => {
      const d = calcRectDistance(sourceElement.pageRect, el.pageRect);

      {
        debug_getElementContext(
          `${d} : "${sourceElement.text}" ${sourceElement.classArray} ${JSON.stringify(
            sourceElement.pageRect,
          )}` +
            ` -> ` +
            `"${el.text}" ${el.classArray} ${JSON.stringify(el.pageRect)}\n`,
        );
      }

      return {
        pageElement: el,
        distance: d,
      };
    })
    .filter((x) => x.distance < 100);

  withContext.sort((a, b) => {
    return a.pageElement.zIndex - b.pageElement.zIndex !== 0
      ? -(a.pageElement.zIndex - b.pageElement.zIndex)
      : a.distance - b.distance !== 0
        ? a.distance - b.distance
        : a.pageElement.pageRect.left - b.pageElement.pageRect.left !== 0
          ? a.pageElement.pageRect.left - b.pageElement.pageRect.left
          : a.pageElement.pageRect.top - b.pageElement.pageRect.top;
  });

  withContext = withContext.filter((_, i) => i < 10);

  {
    let log = '';
    withContext.forEach(({ pageElement: el, distance: d }) => {
      log +=
        `${d} : "${sourceElement.text}" ${sourceElement.classArray}` +
        ` -> ` +
        `"${el.text}" ${el.classArray}\n`;
    });
    log += '-----------------\n';
    debug_getElementContext(log);
  }

  const contextItems = withContext; //.map((x) => x.pageElement);

  return {
    sourceElement: sourceElement,
    contextItems: contextItems,
  };
}

export interface TPageElementContextSimilarityItem {
  a: TPageElementContextItem;
  b: TPageElementContextItem;
  matchExists: boolean;
  matchArea: boolean;
  matchText: boolean;
  matchNodeName: boolean;
  matchClassNames: boolean;
  matchDistance: boolean;
  match: boolean;
  similarityNumberPart: number;
}

export interface TPageElementContextSimilarity {
  aa: TPageElementContext;
  bb: TPageElementContext;
  similarityNumber: number;
  similarityItems: TPageElementContextSimilarityItem[];
}

export function debugToStringElementContextSimilarity(similarity: TPageElementContextSimilarity) {
  let log = '';
  log +=
    `similarity:${similarity.similarityNumber} :` +
    ` "${similarity.aa.sourceElement.text}" ${similarity.aa.sourceElement.classArray}` +
    ` <-> "${similarity.bb.sourceElement.text}" ${similarity.bb.sourceElement.classArray}` +
    `\n`;
  log += `aa : ` + debugToStringElementContext(similarity.aa);
  log += `bb : ` + debugToStringElementContext(similarity.bb);
  similarity.similarityItems.forEach((sim) => {
    const a = sim.a;
    const b = sim.b;
    log += a
      ? `>>>> ${a.distance} "${a.pageElement.text}" ${a.pageElement.classArray}\n`
      : '>>>> null';
    log += b
      ? `     ${b.distance} "${b.pageElement.text}" ${b.pageElement.classArray}\n`
      : '     null';
    for (const k in sim) {
      if (sim.hasOwnProperty(k) && /^match/.test(k)) {
        log += `     ${k} ${(sim as { [key: string]: any })[k]} ${sim.similarityNumberPart}\n`;
      }
    }
  });
  return log;
}

const debug_getElementContextSimilarity = createDebug('puppeteerUtils:getElementContextSimilarity');
export function getElementContextSimilarity(
  aa: TPageElementContext,
  bb: TPageElementContext,
): TPageElementContextSimilarity {
  const similarityItems = [] as TPageElementContextSimilarityItem[];
  let similarityNumber = 0;
  let similarityNumberMax = 0;
  for (let i = 0, ic = Math.max(aa.contextItems.length, bb.contextItems.length); i < ic; ++i) {
    const a = aa.contextItems[i];
    for (let j = 0, jc = ic; j < jc; ++j) {
      if (j > i) {
        const b = bb.contextItems[j];
        const ael = a && a.pageElement;
        const bel = b && b.pageElement;
        const matchExists = !!(a && b);
        const matchArea = matchExists && Math.abs(ael.pageRect.area - bel.pageRect.area) < 2;
        const matchText = matchExists && ael.text === bel.text;
        const matchNodeName = matchExists && ael.nodeName === bel.nodeName;
        const matchClassNames =
          matchExists &&
          ((ael.classArray.length === 0 && bel.classArray.length === 0) ||
            ael.classArray.some((x) => bel.classArray.indexOf(x) >= 0) ||
            bel.classArray.some((x) => ael.classArray.indexOf(x) >= 0));
        const matchDistance = matchExists && Math.abs(a.distance - b.distance) < 2;
        const match = matchExists && matchArea && matchText && matchNodeName && matchClassNames;
        const similarityNumberPart = 1 / (i + 1);
        if (match) {
          similarityNumber += similarityNumberPart;
        }
        similarityNumberMax += similarityNumberPart;
        if (match) {
          similarityItems.push({
            a: a,
            b: b,
            matchExists: matchExists,
            matchArea: matchArea,
            matchText: matchText,
            matchNodeName: matchNodeName,
            matchClassNames: matchClassNames,
            matchDistance: matchDistance,
            match: match,
            similarityNumberPart: similarityNumberPart,
          });
        }
      }
    }
  }
  if (similarityNumberMax > 0) {
    similarityNumber /= similarityNumberMax;
  }
  const similarity = {
    aa: aa,
    bb: bb,
    similarityNumber: similarityNumber,
    similarityItems: similarityItems,
  };
  debug_getElementContextSimilarity(debugToStringElementContextSimilarity(similarity));
  return similarity;
}

export async function makePageModel(browserModel: TBrowserModel, url: string): Promise<TPageModel> {
  const pageModel: TPageModel = {
    browserModel: browserModel,
    page: await browserModel.browser.newPage(),
    pageElementsScan: null,
    mouseViewportPoint: {
      x: browserModel.viewportSize.x * 0.8,
      y: browserModel.viewportSize.y * 0.8,
    } as TViewportPoint,
    mousePagePoint: { x: 0, y: 0 } as TPagePoint,
    pageScrollPagePoint: { x: 0, y: 0 } as TPagePoint,
    viewportSize: { ...browserModel.viewportSize } as TDimensions,
    windowInnerSize: { ...browserModel.viewportSize } as TDimensions,
    windowScrollSize: { x: 0, y: 0 } as TDimensions,
    async update(this: TPageModel, fn?: () => Partial<TPageModel>): Promise<void> {
      let updates = fn ? await fn() : {};
      Object.assign(this, updates);

      const { pageScrollPagePoint, windowInnerSize, windowScrollSize } = await getScrollInfo(this);
      this.pageScrollPagePoint = pageScrollPagePoint;
      this.windowInnerSize = windowInnerSize;
      this.windowScrollSize = windowScrollSize;
      this.mousePagePoint = await convertViewportPointToPagePoint(this, this.mouseViewportPoint);
      this.pageElementsScan = await scanPageElements(this);
      await renderPageElementsScan(this, this.pageElementsScan);
      await renderMouseCursor(this);
    },
  };
  await pageModel.page.setViewport({
    width: pageModel.viewportSize.x,
    height: pageModel.viewportSize.y,
  });
  await pageModel.page.goto(url);
  await pageModel.page.bringToFront();
  await addPageElementsOverlay(pageModel);
  await addMouseCursorOverlay(pageModel);
  await addPageElementsChangeObservers(pageModel);
  await pageModel.update();
  return pageModel;
}

export function findElements(pageModel: TPageModel, finder: TPageElementsFinder): TPageElement[] {
  const pageElementsScan = pageModel.pageElementsScan;
  const pageElements = finder(pageElementsScan ? pageElementsScan.pageElements : []);
  if (!pageElements.length) {
    throw new Error(`Elements not found: ${finder.toString()}`);
  }
  return pageElements;
}

const debug_findElementAgain = createDebug('puppeteerUtils:findElementAgain');
export function findElementAgain(pageModel: TPageModel, sourceElement: TPageElement): TPageElement {
  let candidates: {
    pageElement: TPageElement;
    contextElements: TPageElement[];
  }[] = [];
  const finder = (pageElements: TPageElement[]) => {
    const sameReferenceElement = pageElements.find((x) => x === sourceElement);
    if (sameReferenceElement) {
      return [sameReferenceElement];
    }

    const withoutCurrentElement = pageElements.filter((el) => el !== sourceElement);
    withoutCurrentElement.sort((a, b) => {
      const dx = Math.floor(a.viewportRect.left / 100) - Math.floor(b.viewportRect.left / 100);
      return dx !== 0 ? dx : a.viewportRect.top - b.viewportRect.top;
    });

    debug_findElementAgain(
      `About to compare context of ` +
        `${debugToStringElement(sourceElement)}` +
        ` with contexts of ${withoutCurrentElement.length} elements...\n` +
        withoutCurrentElement
          .map((el, eli) => `${eli + 1}: ${debugToStringElement(el)}`)
          .join('\n'),
    );

    const sourceElementContext = getElementContext(sourceElement);

    debug_findElementAgain(debugToStringElementContext(sourceElementContext));

    const withSimilarity = withoutCurrentElement
      .map((el, eli) => {
        debug_findElementAgain(
          `${eli + 1}: About to compare context of ` +
            `${debugToStringElement(sourceElement)}` +
            ` with context of ${debugToStringElement(el)} ...`,
        );

        const elContext = getElementContext(el);
        const similarity = getElementContextSimilarity(sourceElementContext, elContext);

        debug_findElementAgain(
          `${eli + 1}: Compared context of ${debugToStringElement(el)} -> ` +
            `similarity:${similarity.similarityNumber}`,
        );

        return {
          pageElement: el,
          context: elContext,
          similarityNumber: similarity.similarityNumber,
        };
      })
      .filter((x) => x.similarityNumber > 0.5);

    candidates = withSimilarity.filter((_, i) => i < 5).map((a) => ({
      pageElement: a.pageElement,
      contextElements: a.context.contextItems.map((ctx) => ctx.pageElement),
    }));

    return withSimilarity.map((x) => x.pageElement);
  };
  finder.toString = () =>
    'Again: ' +
    JSON.stringify(convertElementToSerializable(sourceElement), null, 2) +
    (candidates.length > 0
      ? '\nCandidates were:\n' +
        candidates
          .map(
            (a, i) =>
              `${i + 1}. ` +
              `${debugToStringElement(a.pageElement)} ` +
              `contextElements:${JSON.stringify(
                a.contextElements.map((el) => convertElementToSerializable(el)),
                null,
                2,
              )}`,
          )
          .join('\n')
      : '\nNo candidates found.');
  const [foundElement] = findElements(pageModel, finder);
  return foundElement;
}

export function makeElementsAroundFinder(inputs: {
  viewportPoint: TViewportPoint;
  filter: TPageElementsFilter;
  maxDistancePx?: number;
}): TPageElementsFinder {
  const maxDistancePx =
    inputs.maxDistancePx && inputs.maxDistancePx > 0
      ? inputs.maxDistancePx
      : Number.POSITIVE_INFINITY;
  let candidates: {
    pageElement: TPageElement;
    distance: number;
  }[] = [];
  const finder = (pageElements: TPageElement[]) => {
    const withDistance = pageElements.map((el: TPageElement) => {
      const d = calcRectDistance(makeRectFromPoint(inputs.viewportPoint), el.viewportRect);
      return {
        pageElement: el,
        distance: d,
      };
    });
    withDistance.sort((awd, bwd) => {
      const a = awd.pageElement;
      const b = bwd.pageElement;
      const dx = Math.floor(a.viewportRect.left / 100) - Math.floor(b.viewportRect.left / 100);
      return dx !== 0 ? dx : awd.distance - bwd.distance;
    });
    candidates = withDistance.filter((_, i) => i < 5);
    return withDistance
      .filter((a) => a.distance < maxDistancePx)
      .map((a) => a.pageElement)
      .filter(inputs.filter);
  };
  finder.toString = () =>
    inputs.filter.toString() +
    ' around (max ' +
    maxDistancePx +
    ') ' +
    JSON.stringify(inputs.viewportPoint) +
    (candidates.length > 0
      ? '\nCandidates were:\n' +
        candidates
          .map(
            (a, i) =>
              `${i + 1}. ` +
              `${a.distance} ${debugToStringElement(a.pageElement)} ` +
              `viewportRect:${JSON.stringify(a.pageElement.viewportRect)}`,
          )
          .join('\n')
      : '\nNo candidates found.');
  return finder;
}

const debug_makeElementsBelowFinder = createDebug('puppeteerUtils:makeElementsBelowFinder');
export function makeElementsBelowFinder(inputs: {
  viewportPoint: TViewportPoint;
  filter: TPageElementsFilter;
  maxDistancePx?: number;
}): TPageElementsFinder {
  const maxDistancePx =
    inputs.maxDistancePx && inputs.maxDistancePx > 0
      ? inputs.maxDistancePx
      : Number.POSITIVE_INFINITY;
  let candidates: {
    pageElement: TPageElement;
    distance: number;
    verticalDistance: number;
  }[] = [];
  const finder = (pageElements: TPageElement[]) => {
    const withDistance = pageElements.map((el: TPageElement) => {
      const rect = makeRectFromPoint(inputs.viewportPoint);
      const d = calcRectDistance(rect, el.viewportRect);
      const vd = el.viewportRect.top - inputs.viewportPoint.y;

      {
        debug_makeElementsBelowFinder(
          `${d};${vd} : ${JSON.stringify(inputs.viewportPoint)} ${JSON.stringify(rect)}` +
            ` -> ` +
            `${JSON.stringify(el.viewportRect)} "${el.text}" ${el.classArray}\n`,
        );
      }

      return {
        pageElement: el,
        distance: d,
        verticalDistance: vd,
      };
    });
    withDistance.sort((awd, bwd) => {
      const a = awd.pageElement;
      const b = bwd.pageElement;
      const dx = Math.floor(a.viewportRect.left / 100) - Math.floor(b.viewportRect.left / 100);
      return dx !== 0 ? dx : awd.distance - bwd.distance;
    });
    candidates = withDistance.filter((_, i) => i < 5);
    {
      debug_makeElementsBelowFinder(
        candidates
          .map(
            (a, i) =>
              `${i + 1}. ` +
              `${a.distance};${a.verticalDistance} ` +
              `${debugToStringElement(a.pageElement)} ` +
              `${JSON.stringify(a.pageElement.viewportRect)}`,
          )
          .join('\n'),
      );
    }
    return withDistance
      .filter((a) => a.verticalDistance > 0 && a.verticalDistance < maxDistancePx)
      .map((a) => a.pageElement)
      .filter(inputs.filter);
  };
  finder.toString = () =>
    inputs.filter.toString() +
    ' below (max ' +
    maxDistancePx +
    ') ' +
    JSON.stringify(inputs.viewportPoint) +
    (candidates.length > 0
      ? '\nCandidates were:\n' +
        candidates
          .map(
            (a, i) =>
              `${i + 1}. ` +
              `${a.distance};${a.verticalDistance} ` +
              `${debugToStringElement(a.pageElement)} ` +
              `${JSON.stringify(a.pageElement.viewportRect)}`,
          )
          .join('\n')
      : '\nNo candidates found.');
  return finder;
}

export async function animatePoint<TPoint extends TPagePoint | TViewportPoint | TVector2>(
  pageModel: TPageModel,
  startPoint: TPoint,
  endPoint: TPoint,
  speedPixelPerMs: number,
  update: (point: TPoint) => Promise<Partial<TPageModel>>,
): Promise<void> {
  if (process.env.WITH_DEBUG_DELAYS) {
    const distancePixels = calcVectorDistance(startPoint, endPoint);
    const timeTotalMs = distancePixels / speedPixelPerMs;
    const timeStepMs = 5;
    let timeRemainingMs = timeTotalMs;
    let point: TPoint = startPoint;
    let speed: TDimensions;
    while (timeRemainingMs > 0) {
      speed = calcVectorMulScalar(calcVectorDiff(endPoint, point), {
        x: (1 / timeStepMs) as number,
        y: (1 / timeStepMs) as number,
      });
      if (Math.abs(speed.x) < 1 && Math.abs(speed.y) < 1) {
        break;
      }
      point = calcVectorSum(point, speed) as TPoint;
      const updatedModel = await update(point);
      await pageModel.update(() => updatedModel);
      await pageModel.page.waitFor(timeStepMs);
      timeRemainingMs -= timeStepMs;
    }
  }
  const updatedModel = await update(endPoint);
  await pageModel.update(() => updatedModel);
}

export async function convertViewportPointToPagePoint(
  pageModel: TPageModel,
  viewportPoint: TViewportPoint,
): Promise<TPagePoint> {
  return await pageModel.page.evaluate((viewportPoint: TViewportPoint): TPagePoint => {
    // NOTE(@sompylasar): Copy-paste, need to extract into a utility library that is injected.
    function getElementTopLeftPagePoint(sourceElement: HTMLElement): TPagePoint {
      let x = 0;
      let y = 0;
      let el = sourceElement;
      while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
        x += el.offsetLeft - el.scrollLeft;
        y += el.offsetTop - el.scrollTop;
        el = el.offsetParent as HTMLElement;
      }
      return { x: x, y: y } as TPagePoint;
    }

    const element = document.elementFromPoint(
      viewportPoint.x,
      viewportPoint.y,
    ) as HTMLElement | null;
    const pagePoint = element
      ? getElementTopLeftPagePoint(element)
      : calcVectorSum((viewportPoint as any) as TPagePoint, pageModel.pageScrollPagePoint);

    return pagePoint;
  }, viewportPoint);
}

export type TScrollInfo = {
  pageScrollPagePoint: TPagePoint;
  windowInnerSize: TDimensions;
  windowScrollSize: TDimensions;
};

export async function getScrollInfo(pageModel: TPageModel): Promise<TScrollInfo> {
  return await pageModel.page.evaluate((): TScrollInfo => {
    return {
      pageScrollPagePoint: { x: window.pageXOffset, y: window.pageYOffset } as TPagePoint,
      windowInnerSize: { x: window.innerWidth, y: window.innerHeight } as TDimensions,
      windowScrollSize: {
        x: document.documentElement.scrollWidth,
        y: document.documentElement.scrollHeight,
      } as TDimensions,
    };
  });
}

const debug_scrollAtViewportPoint = createDebug('puppeteerUtils:scrollAtViewportPoint');
export async function scrollAtViewportPoint(
  pageModel: TPageModel,
  viewportPoint: TViewportPoint,
  scrollDelta: TDimensions,
): Promise<boolean> {
  const mousePagePoint = pageModel.mousePagePoint;
  debug_scrollAtViewportPoint(
    viewportPoint,
    scrollDelta,
    pageModel.mouseViewportPoint,
    mousePagePoint,
  );
  const speedPixelPerMs = 0.9;
  await animatePoint(
    pageModel,
    { x: 0, y: 0 } as TDimensions,
    scrollDelta,
    speedPixelPerMs,
    async () => {
      const mouseWheelEvent = {
        type: 'mouseWheel',
        button: 'none',
        x: viewportPoint.x,
        y: viewportPoint.y,
        modifiers: 0,
        deltaX: scrollDelta.x / speedPixelPerMs,
        deltaY: scrollDelta.y / speedPixelPerMs,
      };
      await pageModel.page.mouse._client.send('Input.dispatchMouseEvent', mouseWheelEvent);
      return {};
    },
  );
  await pageModel.update();
  const scrolledDistance = calcVectorDistance(mousePagePoint, pageModel.mousePagePoint);
  debug_scrollAtViewportPoint(
    viewportPoint,
    scrollDelta,
    pageModel.mouseViewportPoint,
    mousePagePoint,
    scrolledDistance,
  );
  return scrolledDistance > 1;
}

const debug_moveMouseIntoElementRect = createDebug('puppeteerUtils:moveMouseIntoElementRect');
export async function moveMouseIntoElementRect(pageModel: TPageModel, element: TPageElement) {
  const elementBeforeMouseMove = findElementAgain(pageModel, element);
  const viewportRect = elementBeforeMouseMove.viewportRect;

  const viewportPoints: TViewportPoint[] = [
    {
      x: viewportRect.left + 0.5 * viewportRect.width,
      y: viewportRect.top + 0.5 * viewportRect.height,
    } as TViewportPoint,
    {
      x: viewportRect.left + 0.2 * viewportRect.width,
      y: viewportRect.top + 0.2 * viewportRect.height,
    } as TViewportPoint,
    {
      x: viewportRect.left + 0.2 * viewportRect.width,
      y: viewportRect.top + 0.8 * viewportRect.height,
    } as TViewportPoint,
    {
      x: viewportRect.left + 0.8 * viewportRect.width,
      y: viewportRect.top + 0.2 * viewportRect.height,
    } as TViewportPoint,
    {
      x: viewportRect.left + 0.8 * viewportRect.width,
      y: viewportRect.top + 0.8 * viewportRect.height,
    } as TViewportPoint,
  ];

  const { viewportPoint } = viewportPoints.reduce(
    (accu, vp) => {
      const { distance: accuDistance } = accu;
      const d = calcVectorDistance(pageModel.mouseViewportPoint, vp);
      return d < accuDistance ? { distance: d, viewportPoint: vp } : accu;
    },
    { distance: Number.POSITIVE_INFINITY, viewportPoint: viewportPoints[0] },
  );

  if (isViewportPointOutOfViewport(pageModel, viewportPoint)) {
    throw new Error(
      `moveMouseIntoElementRect: Viewport point ` +
        `${JSON.stringify(viewportPoint)}` +
        ` within rect ${JSON.stringify(viewportRect)}` +
        ` is outside viewport. Scroll there first.`,
    );
  }

  const speedPixelPerMs = 2;
  await animatePoint(
    pageModel,
    pageModel.mouseViewportPoint,
    viewportPoint,
    speedPixelPerMs,
    async (point: TViewportPoint) => {
      debug_moveMouseIntoElementRect('mouse.move', point);
      await pageModel.page.mouse.move(point.x, point.y);
      return {
        mouseViewportPoint: point,
      };
    },
  );

  await pageModel.update();
}

export async function clickMouse(pageModel: TPageModel) {
  await pageModel.page.mouse.click(pageModel.mouseViewportPoint.x, pageModel.mouseViewportPoint.y);
  await pageModel.update();
}

export async function findElementsWithWaiting(
  pageModel: TPageModel,
  findElementsWithBoundFinder: (pageModel: TPageModel) => TPageElement[],
  timeoutMs?: number,
) {
  timeoutMs = timeoutMs || Number.POSITIVE_INFINITY;
  let foundElements: TPageElement[] = [];
  const startMs = Date.now();
  do {
    try {
      await pageModel.update();
      foundElements = findElementsWithBoundFinder(pageModel);
      break;
    } catch (ex) {
      // IGNORE_EXCEPTION
    }
  } while (Date.now() - startMs < timeoutMs);
  if (foundElements.length > 0) {
    return foundElements;
  } else {
    throw new Error(
      'findElementsWithWaiting: Element not found while waiting (max ' +
        timeoutMs +
        'ms): ' +
        findElementsWithBoundFinder.toString(),
    );
  }
}

const debug_findElementsWithScrolling = createDebug('puppeteerUtils:findElementsWithScrolling');
export async function findElementsWithScrolling(
  pageModel: TPageModel,
  findElementsWithBoundFinder: (pageModel: TPageModel) => TPageElement[],
): Promise<TPageElement[]> {
  let foundElements: TPageElement[] = [];
  let attempts = 1000;
  let lastException;
  do {
    try {
      await pageModel.update();
      foundElements = findElementsWithBoundFinder(pageModel);

      // Order by vertical position in the viewport.
      foundElements.sort((a, b) => {
        return a.zIndex - b.zIndex !== 0
          ? -(a.zIndex - b.zIndex)
          : a.viewportRect.top - b.viewportRect.top !== 0
            ? a.viewportRect.top - b.viewportRect.top
            : a.viewportRect.left - b.viewportRect.left !== 0
              ? a.viewportRect.left - b.viewportRect.left
              : -(a.viewportRect.area - b.viewportRect.area);
      });

      const leftTopElement = foundElements[0];
      const leftTopViewportPoint = {
        x: leftTopElement.viewportRect.left,
        y: leftTopElement.viewportRect.top,
      } as TViewportPoint;
      const rightBottomElement = foundElements[foundElements.length - 1];
      const rightBottomViewportPoint = {
        x: rightBottomElement.viewportRect.left + rightBottomElement.viewportRect.width,
        y: rightBottomElement.viewportRect.top + rightBottomElement.viewportRect.height,
      } as TViewportPoint;

      const scrollDeltaPx = 20;
      const scrollToTopmostElement = {
        x:
          leftTopViewportPoint.x < 0
            ? -scrollDeltaPx
            : rightBottomViewportPoint.x > pageModel.viewportSize.x ? scrollDeltaPx : 0,
        y:
          leftTopViewportPoint.y < 0
            ? -scrollDeltaPx
            : rightBottomViewportPoint.y > pageModel.viewportSize.y ? scrollDeltaPx : 0,
      } as TDimensions;

      if (scrollToTopmostElement.x !== 0 || scrollToTopmostElement.y !== 0) {
        debug_findElementsWithScrolling(
          'scrollToTopmostElement',
          pageModel.mouseViewportPoint,
          scrollToTopmostElement,
        );
        if (
          !await scrollAtViewportPoint(
            pageModel,
            pageModel.mouseViewportPoint,
            scrollToTopmostElement,
          )
        ) {
          break;
        }

        await pageModel.update();
        foundElements = findElementsWithBoundFinder(pageModel);
      }

      break;
    } catch (ex) {
      lastException = ex;
      // TODO(@sompylasar): Scan the whole page in spiral movement?
      const scrollDown = { x: 0, y: 20 } as TDimensions;
      debug_findElementsWithScrolling(
        'scrollDown',
        pageModel.mouseViewportPoint,
        scrollDown,
        lastException,
      );
      if (!await scrollAtViewportPoint(pageModel, pageModel.mouseViewportPoint, scrollDown)) {
        break;
      }
    }
  } while (--attempts > 0);
  if (foundElements.length > 0) {
    return foundElements;
  } else {
    throw new Error(
      'findElementsWithScrolling: Element not found while scrolling: ' +
        (lastException ? ' ' + lastException : '') +
        findElementsWithBoundFinder.toString(),
    );
  }
}

export async function findElementBelowLabel(
  pageModel: TPageModel,
  viewportPoint: TViewportPoint,
  labelFilter: TPageElementsFilter,
  elementFilter: TPageElementsFilter,
): Promise<{ element: TPageElement; labelElement: TPageElement }> {
  const [labelElement] = await findElementsWithScrolling(pageModel, () =>
    findElements(
      pageModel,
      makeElementsAroundFinder({
        viewportPoint: viewportPoint,
        filter: labelFilter,
      }),
    ),
  );

  const [element] = await findElementsWithScrolling(pageModel, () =>
    findElements(
      pageModel,
      makeElementsBelowFinder({
        viewportPoint: convertPagePointToViewportPoint(pageModel, labelElement.centerPagePoint),
        filter: elementFilter,
      }),
    ),
  );

  return { element, labelElement };
}

export async function fillOutInput(
  pageModel: TPageModel,
  inputElement: TPageElement,
  value: string,
) {
  await moveMouseIntoElementRect(pageModel, inputElement);
  findElementAgain(pageModel, inputElement);
  await clickMouse(pageModel);
  // TODO(@sompylasar): Ensure the element we're about to type into is focused, the cursor is blinking etc.
  await pageModel.page.keyboard.type(value);
}

const debug_clickElement = createDebug('puppeteerUtils:clickElement');
export async function clickElement(pageModel: TPageModel, element: TPageElement) {
  debug_clickElement(debugToStringElement(element));

  const elementBeforeMouseMove = findElementAgain(pageModel, element);

  debug_clickElement('elementBeforeMouseMove:', debugToStringElement(element));
  debug_clickElement(
    'before moveMouseIntoElementRect mouseViewportPoint:',
    pageModel.mouseViewportPoint,
    'viewportSize:',
    pageModel.viewportSize,
    `elementBeforeMouseMove.viewportRect ${JSON.stringify(elementBeforeMouseMove.viewportRect)}`,
  );

  await moveMouseIntoElementRect(pageModel, elementBeforeMouseMove);

  debug_clickElement(
    'after moveMouseIntoElementRect mouseViewportPoint:',
    pageModel.mouseViewportPoint,
  );

  const elementAfterMouseMove = findElementAgain(pageModel, elementBeforeMouseMove);

  debug_clickElement('before clickMouse mouseViewportPoint:', pageModel.mouseViewportPoint);

  await clickMouse(pageModel);

  debug_clickElement('after clickMouse mouseViewportPoint:', pageModel.mouseViewportPoint);

  const elementAfterClick = findElementAgain(pageModel, elementAfterMouseMove);

  return elementAfterClick;
}

export async function handleError(pageModel: TPageModel, ex: Error) {
  const screenshotPath = await takeScreenshot(pageModel, 'error-' + ex.message);
  const error = new Error();
  Object.assign(error, ex);
  error.name = ex.name;
  error.message =
    ex.message +
    (screenshotPath ? ' ' + screenshotPath : '') +
    (ex.stack || '').replace(/^.+\n/, '\n');
  error.stack = ex.stack;
  console.error(error);
  await debugDelay(pageModel, 200000);
  throw error;
}
