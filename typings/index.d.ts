import * as puppeteer from 'puppeteer';
import { TBrowserModel, TViewportPoint, TDimensions, TPagePoint } from '../src/index';

declare global {
  const __getPuppeteerBrowser: (
    inputs?: {
      browserSize?: TDimensions;
      viewportSize?: TDimensions;
    },
  ) => TBrowserModel;

  interface Window {
    __puppeye__onDomChange: () => void | undefined;
    __puppeye__mousePointer: HTMLElement | undefined;
    __puppeye__updateCoords:
      | ((pointer: HTMLElement, viewportPoint: TViewportPoint, pagePoint: TPagePoint) => void)
      | undefined;
  }
}

declare module 'puppeteer' {
  interface Mouse {
    _client: puppeteer.CDPSession;
  }
}
