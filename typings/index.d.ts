import * as puppeteer from 'puppeteer';
import { TBrowserModel, TViewportPoint, TDimensions, TPagePoint, TPageState } from '../src/types';

declare global {
  const __getPuppeteerBrowser: (
    inputs?: {
      browserSize?: TDimensions;
      viewportSize?: TDimensions;
    },
  ) => TBrowserModel;

  interface Window {
    __puppeye__onNewState: undefined | ((pageState: TPageState) => void);
    __puppeye__state: undefined | TPageState;
  }
}

declare module 'puppeteer' {
  interface Mouse {
    _client: puppeteer.CDPSession;
  }
}
