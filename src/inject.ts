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
  TPageState,
  TPageModel,
  TPagePointerState,
} from './types';

const debug = createDebug('puppeye:inject');

export async function inject(pageModel: TPageModel, onNewState: (pageState: TPageState) => void) {
  await pageModel.page.exposeFunction('__puppeye__onNewState', onNewState);
  await pageModel.page.evaluate(
    (initialState: TPageState, env: { WITH_DEBUG_OVERLAYS: boolean }) => {
      const debug = function(...args: any[]) {
        console.log.apply(console, arguments);
      };
      const debug_getElementContext = debug;

      let _pageState = initialState;
      window.__puppeye__state = _pageState;

      function _setState(updater: (pageState: TPageState) => TPageState | null) {
        const pageStatePrev = _pageState;
        const pageStateNext = updater(_pageState);
        if (pageStateNext === null) {
          return;
        }
        _pageState = window.__puppeye__state = pageStateNext;
        render(_pageState, pageStatePrev);

        const onNewState = window.__puppeye__onNewState;
        if (onNewState) {
          onNewState(_pageState);
        }
      }

      const styleElement = document.createElement('style');
      styleElement.innerHTML = `
.__puppeye__pageElementsOverlay {
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
.__puppeye__pageElement {
  position: absolute;
  pointer-events: none;
  border: 1px solid transparent;
  color: transparent;
  font-size: 9px;
  font-weight: bold;
  line-height: 9px;
  overflow: hidden;
}
.__puppeye__pointersOverlay {
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
.__puppeye__pointer {
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
.__puppeye__pointer.__puppeye__button-1 {
  transition: none;
  background: rgba(0,0,0,0.9);
}
.__puppeye__pointer.__puppeye__button-2 {
  transition: none;
  border-color: rgba(0,0,255,0.9);
}
.__puppeye__pointer.__puppeye__button-3 {
  transition: none;
  border-radius: 4px;
}
.__puppeye__pointer.__puppeye__button-4 {
  transition: none;
  border-color: rgba(255,0,0,0.9);
}
.__puppeye__pointer.__puppeye__button-5 {
  transition: none;
  border-color: rgba(0,255,0,0.9);
}
`;
      document.head.appendChild(styleElement);
      const pointersOverlayEl = document.createElement('div');
      pointersOverlayEl.classList.add('__puppeye__pointersOverlay');
      const mousePointerEl = document.createElement('div');
      mousePointerEl.classList.add('__puppeye__pointer');
      pointersOverlayEl.appendChild(mousePointerEl);
      document.body.appendChild(pointersOverlayEl);

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

      // NOTE(@sompylasar): Copy-paste, need to extract into a utility library that is injected.
      function calcVectorSum<T extends TVector2>(a: T, b: T | TDimensions): T {
        return { x: a.x + b.x, y: a.y + b.y } as T;
      }

      function convertViewportPointToPagePoint(viewportPoint: TViewportPoint): TPagePoint {
        const element = document.elementFromPoint(
          viewportPoint.x,
          viewportPoint.y,
        ) as HTMLElement | null;

        const pageScrollPagePoint = { x: window.pageXOffset, y: window.pageYOffset } as TPagePoint;

        const pagePoint = element
          ? getElementTopLeftPagePoint(element)
          : calcVectorSum((viewportPoint as any) as TPagePoint, pageScrollPagePoint);

        return pagePoint;
      }

      function scanPage() {
        const selector =
          'a, button, label, span, div, p, li, dt, dd, h1, h2, h3, h4, h5, h6, img, svg, input, select, [tabindex], [role]';
        const allNodes = Array.from(document.body.querySelectorAll(selector));

        // NOTE(@sompylasar): The below functions are defined in the browser context, cannot reuse those from above.
        function normalizeText(text: string): string {
          return String(text || '')
            .replace(/(^\s+|\s+$)/g, '')
            .replace(/\s+/g, ' ')
            .toLowerCase();
        }

        function getText(el: HTMLElement): string {
          if (el.nodeName.toLowerCase() === 'select') {
            const options = el.querySelectorAll('option') as NodeListOf<HTMLElement>;
            if ((el as HTMLSelectElement).multiple) {
              // TODO(@sompylasar): Only include visible options.
              return [].map.call(options, (el: HTMLElement) => getText(el)).join('\n');
            } else {
              const optionsSelected = [].filter.call(
                options,
                (el: HTMLOptionElement) => el.selected,
              );
              return optionsSelected[0]
                ? getText(optionsSelected[0])
                : options[0] ? getText(options[0]) : '';
            }
          }
          return ['aria-label', 'alt', 'innerText', 'value', 'placeholder', 'title', 'href'].reduce(
            (accu, attr) => {
              const attrValue = attr in el ? (el as any)[attr] : el.getAttribute(attr);
              return accu || !attrValue
                ? accu
                : attr === 'innerText' ? attrValue : `@@${attr}@@${attrValue}`;
            },
            '',
          );
        }

        function checkIsImage(el: HTMLElement): boolean {
          return ['img', 'svg'].indexOf(el.nodeName.toLowerCase()) >= 0;
        }

        function checkIsInteractive(el: HTMLElement): boolean {
          return (
            ['a', 'button', 'input', 'select'].indexOf(el.nodeName.toLowerCase()) >= 0 ||
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

        function calcVectorDiff<T extends TVector2>(a: T, b: T): TDimensions {
          return { x: a.x - b.x, y: a.y - b.y } as TDimensions;
        }

        function calcVectorDistance<T extends TVector2>(a: T, b: T): number {
          const dv = calcVectorDiff(b, a);
          const d = dv.x * dv.x + dv.y * dv.y;
          return Math.sqrt(d);
        }

        // https://stackoverflow.com/a/26178015
        function calcRectDistance(a: TRect, b: TRect): number {
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
          .filter((el: HTMLElement): boolean => !/(^| )__puppeye__/.test(el.className))
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
                const style =
                  parentNode === el ? computedStyle : window.getComputedStyle(parentNode);
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
            ['disabled', 'checked', 'selected', 'multiple'].forEach((prop) => {
              if (prop in el) {
                attributes[prop] = (el as any)[prop];
              }
            });

            const element: TPageElement = {
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
              centerRightViewportPoint: makeCenterRightPointFromRect(
                viewportRect,
              ) as TViewportPoint,
              pageRect: pageRect,
              centerPagePoint: makeCenterPointFromRect(pageRect) as TPagePoint,
              centerLeftPagePoint: makeCenterLeftPointFromRect(pageRect) as TPagePoint,
              centerRightPagePoint: makeCenterRightPointFromRect(pageRect) as TPagePoint,
              contextItemsSerializable: [],
              contextItems: [],
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

        pageElements.forEach((sourceElement) => {
          let contextItems = pageElements
            .filter((el) => el !== sourceElement)
            .map((el: TPageElement) => {
              const d = calcRectDistance(sourceElement.pageRect, el.pageRect);

              if (0) {
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

          contextItems.sort((a, b) => {
            return a.pageElement.zIndex - b.pageElement.zIndex !== 0
              ? -(a.pageElement.zIndex - b.pageElement.zIndex)
              : a.distance - b.distance !== 0
                ? a.distance - b.distance
                : a.pageElement.pageRect.left - b.pageElement.pageRect.left !== 0
                  ? a.pageElement.pageRect.left - b.pageElement.pageRect.left
                  : a.pageElement.pageRect.top - b.pageElement.pageRect.top;
          });

          contextItems = contextItems.filter((_, i) => i < 10);

          if (0) {
            let log = '';
            contextItems.forEach(({ pageElement: el, distance: d }) => {
              log +=
                `${d} : "${sourceElement.text}" ${sourceElement.classArray}` +
                ` -> ` +
                `"${el.text}" ${el.classArray}\n`;
            });
            log += '-----------------\n';
            debug_getElementContext(log);
          }

          sourceElement.contextItemsSerializable = contextItems.map(
            ({ pageElement, distance }) => ({
              pageElementIndex: pageElements.indexOf(pageElement),
              distance: distance,
            }),
          );
        });

        const pageScrollPagePoint = { x: window.pageXOffset, y: window.pageYOffset } as TPagePoint;
        const windowInnerSize = { x: window.innerWidth, y: window.innerHeight } as TDimensions;
        const windowScrollSize = {
          x: document.documentElement.scrollWidth,
          y: document.documentElement.scrollHeight,
        } as TDimensions;

        _setState((pageState: TPageState) =>
          Object.assign({}, pageState, {
            pageStateVersion: pageState.pageStateVersion + 1,
            pageElements: pageElements,
            pageScrollPagePoint: pageScrollPagePoint,
            viewportSize: Object.assign({}, windowInnerSize),
            windowInnerSize: windowInnerSize,
            windowScrollSize: windowScrollSize,
          }),
        );
      }

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

      function observePageElements() {
        const scanPageThrottled = throttle(scanPage, 100);

        const observers: MutationObserver[] = [];
        const rootEls = document.querySelectorAll('body > *');
        for (let i = 0; i < rootEls.length; ++i) {
          const rootEl = rootEls.item(i);
          if (/^__puppeye__/.test(rootEl.className)) {
            continue;
          }
          const observer = new MutationObserver(scanPageThrottled);
          observer.observe(rootEl, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
          });
          observers.push(observer);
        }

        window.addEventListener('scroll', scanPageThrottled, true);
        window.addEventListener('resize', scanPageThrottled, true);

        let scanPageRepeatedlyTimer: number;
        function scanPageRepeatedly() {
          scanPageThrottled();
          scanPageRepeatedlyTimer = window.setTimeout(scanPageRepeatedly, 500);
        }
        scanPageRepeatedly();
      }

      function observeMousePointer() {
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
            const buttonMask = event.buttons;
            _setState((pageState: TPageState) =>
              Object.assign({}, pageState, {
                mousePointer: {
                  viewportPoint: viewportPoint,
                  pagePoint: pagePoint,
                  buttonMask: buttonMask,
                },
              }),
            );
          },
          true,
        );
        document.addEventListener(
          'mousedown',
          (event) => {
            const buttonMask = event.buttons;
            _setState((pageState: TPageState) =>
              Object.assign({}, pageState, {
                mousePointer: Object.assign({}, pageState.mousePointer, {
                  buttonMask: buttonMask,
                }),
              }),
            );
          },
          true,
        );
        document.addEventListener(
          'mouseup',
          (event) => {
            const buttonMask = event.buttons;
            _setState((pageState: TPageState) =>
              Object.assign({}, pageState, {
                mousePointer: Object.assign({}, pageState.mousePointer, {
                  buttonMask: buttonMask,
                }),
              }),
            );
          },
          true,
        );
      }

      function getColorForPageStateVersion(version: number) {
        const colors = [
          'rgba(255,0,255,0.5)',
          'rgba(255,0,0,0.5)',
          'rgba(0,100,200,0.5)',
          'rgba(0,0,255,0.5)',
        ];
        return colors[version % colors.length];
      }

      let _pageElementsOverlayEl: HTMLElement | null = null;
      function renderPageElements(pageElements: TPageElement[], pageStateVersion: number) {
        const color = getColorForPageStateVersion(pageStateVersion);
        const pageElementsOverlayExisting: HTMLElement | null = _pageElementsOverlayEl;
        if (pageElementsOverlayExisting && pageElementsOverlayExisting.parentNode) {
          pageElementsOverlayExisting.parentNode.removeChild(pageElementsOverlayExisting);
        }
        const pageElementsOverlay = document.createElement('div');
        pageElementsOverlay.classList.add('__puppeye__pageElementsOverlay');
        pageElementsOverlay.style.pointerEvents = 'none';
        pageElements.forEach(({ viewportRect, zIndex, text }, index) => {
          const box = document.createElement('div');
          box.classList.add('__puppeye__pageElement');
          box.style.left = `${viewportRect.left}px`;
          box.style.top = `${viewportRect.top}px`;
          box.style.zIndex = `${index + 1}`;
          box.style.width = `${viewportRect.width}px`;
          box.style.height = `${viewportRect.height}px`;
          box.style.borderColor = color;
          box.style.color = color;
          box.innerText = `x:${viewportRect.left}|y:${viewportRect.top}|z:${zIndex}|text:${text}`;
          pageElementsOverlay.appendChild(box);
        });
        document.body.appendChild(pageElementsOverlay);
        _pageElementsOverlayEl = pageElementsOverlay;
      }

      function renderPointer(pointerState: TPagePointerState, pointerEl: HTMLElement) {
        pointerEl.style.left = `${pointerState.viewportPoint.x}px`;
        pointerEl.style.top = `${pointerState.viewportPoint.y}px`;
        if (env.WITH_DEBUG_OVERLAYS) {
          pointerEl.innerText =
            `${pointerState.viewportPoint.x.toFixed(4)};${pointerState.viewportPoint.y.toFixed(
              4,
            )}` + `|${pointerState.pagePoint.x.toFixed(4)};${pointerState.pagePoint.y.toFixed(4)}`;
        }
        for (let i = 0; i < 5; i++) {
          pointerEl.classList.toggle(
            '__puppeye__button-' + i,
            Boolean(pointerState.buttonMask & (1 << i)),
          );
        }
      }

      function render(pageState: TPageState, pageStatePrev: TPageState | null) {
        if (!pageStatePrev || pageState.pageElements !== pageStatePrev.pageElements) {
          renderPageElements(pageState.pageElements, pageState.pageStateVersion);
        }
        if (!pageStatePrev || pageState.mousePointer !== pageStatePrev.mousePointer) {
          renderPointer(pageState.mousePointer, mousePointerEl);
        }
      }

      render(_pageState, null);
      observePageElements();
      observeMousePointer();
    },
    pageModel.getPageState(),
    {
      WITH_DEBUG_OVERLAYS: !!process.env.WITH_DEBUG_OVERLAYS,
    },
  );
}
