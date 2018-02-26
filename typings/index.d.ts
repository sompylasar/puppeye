import * as puppeteer from 'puppeteer';
import { TBrowserModel, TViewportPoint, TDimensions, TPagePoint } from '../src/index';

declare global {
  const __ppt: (
    inputs?: {
      browserSize?: TDimensions;
      viewportSize?: TDimensions;
    },
  ) => TBrowserModel;

  interface Window {
    __puppeteer_boxes_color_index__: number | undefined;
    __puppeteer_ondomchange__: () => void | undefined;
    __puppeteer_mouse_updatecoords__: (
      viewportPoint: TViewportPoint,
      pagePoint: TPagePoint,
    ) => void;
  }
}

declare module 'puppeteer' {
  interface Mouse {
    _client: puppeteer.CDPSession;
  }
}
