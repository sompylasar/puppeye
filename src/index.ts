import * as puppeteer from 'puppeteer';
import * as createDebug from 'debug';
import {
  TVector2,
  TPagePoint,
  TViewportPoint,
  TDimensions,
  TRect,
  TPageRect,
  TViewportRect,
  TPageElement,
  TPageElementsScan,
  TPageState,
  TPageModel,
  TBrowserModel,
  TPageElementsFinder,
  TPageElementsFilter,
  TPageElementContext,
  TPageElementContextItem,
  TPageElementContextSimilarity,
  TPageElementContextSimilarityItem,
} from './types';
import { inject } from './inject';

export * from './types';

const debug = createDebug('puppeye:index');

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
  debug.namespace + ':convertPagePointToViewportPoint',
);
export function convertPagePointToViewportPoint(
  pageState: TPageState,
  pagePoint: TPagePoint,
): TViewportPoint {
  const viewportPoint = calcVectorDiff(
    pagePoint as TVector2,
    pageState.pageScrollPagePoint as TVector2,
  );
  debug_convertPagePointToViewportPoint(
    pagePoint,
    pageState.pageScrollPagePoint,
    '->',
    viewportPoint,
  );
  return (viewportPoint as any) as TViewportPoint;
}

export function isViewportPointOutOfViewport(
  pageState: TPageState,
  viewportPoint: TViewportPoint,
): boolean {
  return (
    viewportPoint.x < 0 ||
    viewportPoint.x > pageState.viewportSize.x ||
    viewportPoint.y < 0 ||
    viewportPoint.y > pageState.viewportSize.y
  );
}

export function debugToStringElement(element: TPageElement, short: boolean = false): string {
  const attributesString = Object.keys(element.attributes)
    .map((x) => `${x}="${element.attributes[x]}"`)
    .join(' ');
  return (
    `<${element.nodeName} ${attributesString}` +
    ` text:${JSON.stringify(element.text)}` +
    (!short
      ? ` pageRect:${JSON.stringify(element.pageRect)}` +
        ` viewportRect:${JSON.stringify(element.viewportRect)}`
      : '') +
    `>`
  );
}

export function debugToStringElementContext(
  pageElements: TPageElement[],
  ctx: TPageElementContext,
): string {
  let log = '';
  log += `context : ${debugToStringElement(ctx.sourceElement, true)}\n`;
  ctx.contextItems.forEach((ctxItem) => {
    log += `     D:${ctxItem.distance} : ${debugToStringElement(ctxItem.pageElement)}\n`;
  });
  return log;
}

export function getElementContext(
  pageElements: TPageElement[],
  sourceElement: TPageElement,
): TPageElementContext {
  return {
    sourceElement: sourceElement,
    contextItems: sourceElement.contextItems,
  };
}

export function debugToStringElementContextSimilarity(
  pageElements: TPageElement[],
  similarity: TPageElementContextSimilarity,
) {
  let log = '';
  log +=
    `similarity:${similarity.similarityNumber} :` +
    ` ${debugToStringElement(similarity.aa.sourceElement, true)}` +
    ` <-> ${debugToStringElement(similarity.bb.sourceElement, true)}` +
    `\n`;
  log += `aa : ` + debugToStringElementContext(pageElements, similarity.aa);
  log += `bb : ` + debugToStringElementContext(pageElements, similarity.bb);
  similarity.similarityItems.forEach((sim) => {
    const a = sim.a;
    const b = sim.b;
    log += a
      ? `>>>> D:${a.distance} : ${debugToStringElement(a.pageElement, true)}\n`
      : '>>>> null';
    log += b
      ? `     D:${b.distance} : ${debugToStringElement(b.pageElement, true)}\n`
      : '     null';
    for (const k in sim) {
      if (sim.hasOwnProperty(k) && /^match/.test(k)) {
        log += `     ${k} : ${(sim as { [key: string]: any })[k]} ${sim.similarityNumberPart}\n`;
      }
    }
  });
  return log;
}

const debug_getElementContextSimilarity = createDebug(
  debug.namespace + ':getElementContextSimilarity',
);
export function getElementContextSimilarity(
  pageElements: TPageElement[],
  aa: TPageElementContext,
  bb: TPageElementContext,
): TPageElementContextSimilarity {
  const similarityItems = [] as TPageElementContextSimilarityItem[];
  let similarityNumber = 0;
  let similarityNumberMax = 0;
  let similarityPairs: { a: TPageElementContextItem; b: TPageElementContextItem }[] = [];
  for (let i = 0, ic = aa.contextItems.length; i < ic; ++i) {
    const a = aa.contextItems[i];
    for (let j = 0, jc = bb.contextItems.length; j < jc; ++j) {
      const b = bb.contextItems[j];
      if (Math.abs(b.distance - a.distance) < 3) {
        similarityPairs.push({ a, b });
      }
    }
  }
  for (let i = 0, ic = similarityPairs.length; i < ic; ++i) {
    const p = similarityPairs[i];
    const a = p.a;
    const b = p.b;
    const ael = a.pageElement;
    const bel = b.pageElement;
    const matchArea = Math.abs(ael.pageRect.area - bel.pageRect.area) < 2;
    const matchText = ael.text === bel.text;
    const matchNodeName = ael.nodeName === bel.nodeName;
    const matchClassNames =
      (ael.classArray.length === 0 && bel.classArray.length === 0) ||
      ael.classArray.some((x) => bel.classArray.indexOf(x) >= 0) ||
      bel.classArray.some((x) => ael.classArray.indexOf(x) >= 0);
    const matchDistance = Math.abs(a.distance - b.distance) < 2;
    const match = matchArea && matchText && matchNodeName && matchClassNames;
    const similarityNumberPart = 1 / (i + 1);
    if (match) {
      similarityNumber += similarityNumberPart;
    }
    similarityNumberMax += similarityNumberPart;
    if (match) {
      similarityItems.push({
        a: a,
        b: b,
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
  if (similarityNumberMax > 0) {
    similarityNumber /= similarityNumberMax;
  }
  const similarity = {
    aa: aa,
    bb: bb,
    similarityNumber: similarityNumber,
    similarityItems: similarityItems,
  };
  debug_getElementContextSimilarity(
    debugToStringElementContextSimilarity(pageElements, similarity),
  );
  return similarity;
}

export async function makePageModel(browserModel: TBrowserModel, url: string): Promise<TPageModel> {
  const page = await browserModel.browser.newPage();
  let _pageState: TPageState = {
    pageStateVersion: 0,
    pageElements: [],
    mousePointer: {
      viewportPoint: { x: 0, y: 0 } as TViewportPoint,
      pagePoint: { x: 0, y: 0 } as TPagePoint,
      buttonMask: 0,
    },
    pageScrollPagePoint: { x: 0, y: 0 } as TPagePoint,
    viewportSize: { ...browserModel.viewportSize } as TDimensions,
    windowInnerSize: { x: 0, y: 0 } as TDimensions,
    windowScrollSize: { x: 0, y: 0 } as TDimensions,
  };
  let _pageStatePromise: Promise<void> | null;
  let _pageStatePromiseResolve: Function;
  const pageModel: TPageModel = {
    browserModel: browserModel,
    page: page,
    getPageState: () => _pageState,
    waitForNextPageState: () => {
      if (_pageStatePromise) {
        return _pageStatePromise;
      }
      return new Promise((resolve) => {
        _pageStatePromiseResolve = resolve;
      }).then(() => {
        _pageStatePromise = null;
      });
    },
  };
  await page.setViewport({
    width: browserModel.viewportSize.x,
    height: browserModel.viewportSize.y,
  });
  await page.goto(url);
  await page.bringToFront();
  await inject(pageModel, (pageState: TPageState) => {
    _pageState = {
      ...pageState,
      pageElements: pageState.pageElements.map((pageElement) => ({
        ...pageElement,
        contextItems: pageElement.contextItemsSerializable.map(({ pageElementIndex, ...rest }) => ({
          pageElement: pageState.pageElements[pageElementIndex],
          ...rest,
        })),
      })),
    };
    if (_pageStatePromiseResolve) {
      _pageStatePromiseResolve();
    }
  });
  return pageModel;
}

export async function findElements(
  pageModel: TPageModel,
  finder: TPageElementsFinder,
): Promise<TPageElement[]> {
  const pageState = pageModel.getPageState();
  const pageElements = finder(pageState.pageElements);
  if (!pageElements.length) {
    throw new Error(`Elements not found: ${finder.toString()}`);
  }
  return pageElements;
}

const debug_findElementAgain = createDebug(debug.namespace + ':findElementAgain');
export async function findElementAgain(
  pageModel: TPageModel,
  sourceElement: TPageElement,
): Promise<TPageElement> {
  type TCandidate = {
    pageElement: TPageElement;
    contextElements: TPageElement[];
  };
  let candidates: TCandidate[] = [];
  function debugToStringCandidates(candidates: TCandidate[]) {
    return candidates.length > 0
      ? '\nCandidates were:\n' +
          candidates
            .map(
              (a, i) =>
                `${i + 1}. ` +
                `${debugToStringElement(a.pageElement)} ` +
                `contextElements:` +
                (a.contextElements.length <= 0
                  ? '[]'
                  : `\n    | ${a.contextElements
                      .map((el) => debugToStringElement(el))
                      .join('\n    | ')}`) +
                '\n\n',
            )
            .join('\n')
      : '\nNo candidates found.';
  }
  const finder = (pageElements: TPageElement[]) => {
    const sameReferenceElement = pageElements.find((x) => x === sourceElement);
    if (sameReferenceElement) {
      return [sameReferenceElement];
    }

    const pageElementsSorted = [...pageElements];
    pageElementsSorted.sort((a, b) => {
      const dx = Math.floor(a.viewportRect.left / 100) - Math.floor(b.viewportRect.left / 100);
      return dx !== 0 ? dx : a.viewportRect.top - b.viewportRect.top;
    });

    debug_findElementAgain(
      `About to compare context of \n` +
        `    ${debugToStringElement(sourceElement)}\n` +
        `with contexts of ${pageElementsSorted.length} elements...\n` +
        pageElementsSorted.map((el, eli) => `${eli + 1}: ${debugToStringElement(el)}`).join('\n'),
    );

    const sourceElementContext = getElementContext(pageElements, sourceElement);

    debug_findElementAgain(debugToStringElementContext(pageElements, sourceElementContext));

    const withSimilarity = pageElementsSorted
      .map((el, eli) => {
        debug_findElementAgain(
          `${eli + 1}: About to compare context of \n` +
            `    ${debugToStringElement(sourceElement)}\n` +
            `with context of \n` +
            `    ${debugToStringElement(el)} ...`,
        );

        const elContext = getElementContext(pageElements, el);
        const similarity = getElementContextSimilarity(
          pageElements,
          sourceElementContext,
          elContext,
        );

        debug_findElementAgain(
          `${eli + 1}: Compared context of \n` +
            `    ${debugToStringElement(sourceElement)}\n` +
            `with context of \n` +
            `    ${debugToStringElement(el)}\n` +
            `-> similarity:${similarity.similarityNumber}\n\n`,
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

    const foundElements = withSimilarity.filter((_, i) => i < 1).map((x) => x.pageElement);

    debug_findElementAgain(
      `With source element: \n` +
        `    ${debugToStringElement(sourceElement)}\n` +
        `found elements: \n` +
        foundElements.map((el, eli) => `${eli + 1}: ${debugToStringElement(el)}`).join('\n') +
        debugToStringCandidates(candidates) +
        '\n\n',
    );

    return foundElements;
  };
  finder.toString = () =>
    'Again: ' + debugToStringElement(sourceElement) + debugToStringCandidates(candidates);
  const [foundElement] = await findElements(pageModel, finder);
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

const debug_makeElementsBelowFinder = createDebug(debug.namespace + ':makeElementsBelowFinder');
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
          `D:${d}; VD:${vd} : ${JSON.stringify(inputs.viewportPoint)} ${JSON.stringify(rect)}` +
            ` -> ` +
            `${debugToStringElement(el)}\n`,
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
              `D:${a.distance}; VD:${a.verticalDistance} : ` +
              `${debugToStringElement(a.pageElement)}`,
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
  applyToPage: (point: TPoint) => Promise<void>,
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
      await applyToPage(point);
      await pageModel.page.waitFor(timeStepMs);
      timeRemainingMs -= timeStepMs;
    }
  }
  await applyToPage(endPoint);
}

const debug_scrollAtViewportPoint = createDebug(debug.namespace + ':scrollAtViewportPoint');
export async function scrollAtViewportPoint(
  pageModel: TPageModel,
  viewportPoint: TViewportPoint,
  scrollDelta: TDimensions,
): Promise<boolean> {
  const pageStateBeforeScroll = pageModel.getPageState();
  debug_scrollAtViewportPoint(
    viewportPoint,
    scrollDelta,
    pageStateBeforeScroll.mousePointer.viewportPoint,
    pageStateBeforeScroll.mousePointer.pagePoint,
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
    },
  );
  const pageStateAfterScroll = pageModel.getPageState();
  const scrolledDistance = calcVectorDistance(
    pageStateBeforeScroll.mousePointer.pagePoint,
    pageStateAfterScroll.mousePointer.pagePoint,
  );
  debug_scrollAtViewportPoint(
    viewportPoint,
    scrollDelta,
    pageStateAfterScroll.mousePointer.viewportPoint,
    pageStateAfterScroll.mousePointer.pagePoint,
    scrolledDistance,
  );
  return scrolledDistance > 1;
}

const debug_moveMouseIntoElementRect = createDebug(debug.namespace + ':moveMouseIntoElementRect');
export async function moveMouseIntoElementRect(pageModel: TPageModel, element: TPageElement) {
  const elementBeforeMouseMove = await findElementAgain(pageModel, element);
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

  const pageState = pageModel.getPageState();
  const mouseViewportPoint = pageState.mousePointer.viewportPoint;

  const { viewportPoint } = viewportPoints.reduce(
    (accu, vp) => {
      const { distance: accuDistance } = accu;
      const d = calcVectorDistance(mouseViewportPoint, vp);
      return d < accuDistance ? { distance: d, viewportPoint: vp } : accu;
    },
    { distance: Number.POSITIVE_INFINITY, viewportPoint: viewportPoints[0] },
  );

  if (isViewportPointOutOfViewport(pageState, viewportPoint)) {
    throw new Error(
      `moveMouseIntoElementRect: Viewport point ` +
        `${JSON.stringify(viewportPoint)}` +
        ` within rect ${JSON.stringify(viewportRect)}` +
        ` is outside viewport ${JSON.stringify(pageState.viewportSize)}. Scroll there first.`,
    );
  }

  const speedPixelPerMs = 2;
  await animatePoint(
    pageModel,
    mouseViewportPoint,
    viewportPoint,
    speedPixelPerMs,
    async (point: TViewportPoint) => {
      debug_moveMouseIntoElementRect('mouse.move', point);
      await pageModel.page.mouse.move(point.x, point.y);
    },
  );
}

export async function clickMouse(pageModel: TPageModel) {
  const pageState = pageModel.getPageState();
  const mouseViewportPoint = pageState.mousePointer.viewportPoint;
  await pageModel.page.mouse.click(mouseViewportPoint.x, mouseViewportPoint.y);
}

export async function findElementsWithWaiting(
  pageModel: TPageModel,
  findElementsWithBoundFinder: (pageModel: TPageModel) => Promise<TPageElement[]>,
  timeoutMs?: number,
) {
  timeoutMs = timeoutMs || Number.POSITIVE_INFINITY;
  let foundElements: TPageElement[] = [];
  const startMs = Date.now();
  do {
    try {
      foundElements = await findElementsWithBoundFinder(pageModel);
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

const debug_findElementsWithScrolling = createDebug(debug.namespace + ':findElementsWithScrolling');
export async function findElementsWithScrolling(
  pageModel: TPageModel,
  findElementsWithBoundFinder: (pageModel: TPageModel) => Promise<TPageElement[]>,
): Promise<TPageElement[]> {
  let foundElements: TPageElement[] = [];
  let attempts = 1000;
  let lastException;
  do {
    const pageState = pageModel.getPageState();
    const viewportSize = pageState.viewportSize;
    const mouseViewportPoint = pageState.mousePointer.viewportPoint;

    try {
      foundElements = await findElementsWithBoundFinder(pageModel);

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
            : rightBottomViewportPoint.x > viewportSize.x ? scrollDeltaPx : 0,
        y:
          leftTopViewportPoint.y < 0
            ? -scrollDeltaPx
            : rightBottomViewportPoint.y > viewportSize.y ? scrollDeltaPx : 0,
      } as TDimensions;

      if (scrollToTopmostElement.x !== 0 || scrollToTopmostElement.y !== 0) {
        debug_findElementsWithScrolling(
          'scrollToTopmostElement',
          mouseViewportPoint,
          scrollToTopmostElement,
        );
        if (!await scrollAtViewportPoint(pageModel, mouseViewportPoint, scrollToTopmostElement)) {
          break;
        }

        foundElements = await findElementsWithBoundFinder(pageModel);
      }

      break;
    } catch (ex) {
      lastException = ex;
      // TODO(@sompylasar): Scan the whole page in spiral movement?
      const scrollDown = { x: 0, y: 20 } as TDimensions;
      debug_findElementsWithScrolling('scrollDown', mouseViewportPoint, scrollDown, lastException);
      if (!await scrollAtViewportPoint(pageModel, mouseViewportPoint, scrollDown)) {
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
  const [labelElement] = await findElementsWithScrolling(
    pageModel,
    async () =>
      await findElements(
        pageModel,
        makeElementsAroundFinder({
          viewportPoint: viewportPoint,
          filter: labelFilter,
        }),
      ),
  );

  const [element] = await findElementsWithScrolling(
    pageModel,
    async () =>
      await findElements(
        pageModel,
        makeElementsBelowFinder({
          viewportPoint: convertPagePointToViewportPoint(
            pageModel.getPageState(),
            labelElement.centerPagePoint,
          ),
          filter: elementFilter,
        }),
      ),
  );

  return { element, labelElement };
}

export function filterReadsLike(text: string): TPageElementsFilter {
  return annotate(
    (el: TPageElement) => {
      return el.textNormalized === normalizeText(text);
    },
    { filterReadsLike: { text } },
  );
}

export function filterLooksLikeTextInput(): TPageElementsFilter {
  // TODO(@sompylasar): Rely less on DOM structure (i.e. nodeName and attributes).
  return annotate(
    (el: TPageElement): boolean => {
      return (
        el.nodeName === 'input' &&
        (el.attributes.type === 'text' || el.attributes.type === 'password')
      );
    },
    { filterLooksLikeTextInput: true },
  );
}

export function filterLooksLikeDropdown() {
  // TODO(@sompylasar): Rely less on DOM structure (i.e. nodeName and attributes).
  return annotate(
    (el: TPageElement): boolean => {
      return el.nodeName === 'select' && !el.attributes.multiple;
    },
    { filterLooksLikeDropdown: true },
  );
}

export async function fillOutInput(
  pageModel: TPageModel,
  inputElement: TPageElement,
  value: string,
) {
  await moveMouseIntoElementRect(pageModel, inputElement);
  await findElementAgain(pageModel, inputElement);
  await clickMouse(pageModel);
  await pageModel.waitForNextPageState();
  // TODO(@sompylasar): Ensure the element we're about to type into is focused, the cursor is blinking etc.
  await pageModel.page.keyboard.type(value);
}

const debug_clickElement = createDebug(debug.namespace + ':clickElement');
export async function clickElement(pageModel: TPageModel, element: TPageElement) {
  debug_clickElement(debugToStringElement(element));

  const elementBeforeMouseMove = await findElementAgain(pageModel, element);

  debug_clickElement('elementBeforeMouseMove:', debugToStringElement(element));
  const pageStateBeforeMove = pageModel.getPageState();
  debug_clickElement(
    'before moveMouseIntoElementRect mouseViewportPoint:',
    pageStateBeforeMove.mousePointer.viewportPoint,
    'viewportSize:',
    pageStateBeforeMove.viewportSize,
    `elementBeforeMouseMove.viewportRect ${JSON.stringify(elementBeforeMouseMove.viewportRect)}`,
  );

  await moveMouseIntoElementRect(pageModel, elementBeforeMouseMove);
  await pageModel.waitForNextPageState();

  debug_clickElement(
    'after moveMouseIntoElementRect mouseViewportPoint:',
    pageModel.getPageState().mousePointer.viewportPoint,
  );

  const elementAfterMouseMove = await findElementAgain(pageModel, elementBeforeMouseMove);

  debug_clickElement(
    'before clickMouse mouseViewportPoint:',
    pageModel.getPageState().mousePointer.viewportPoint,
  );

  await clickMouse(pageModel);
  await pageModel.waitForNextPageState();

  debug_clickElement(
    'after clickMouse mouseViewportPoint:',
    pageModel.getPageState().mousePointer.viewportPoint,
  );

  const elementAfterClick = await findElementAgain(pageModel, elementAfterMouseMove);

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
  debug(
    'handleError pageElements:\n' +
      pageModel
        .getPageState()
        .pageElements.map((el) => debugToStringElement(el))
        .join('\n') +
      '\n\n',
  );
  await debugDelay(pageModel, 200000);
  throw error;
}
