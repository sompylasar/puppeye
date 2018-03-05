import * as puppeteer from 'puppeteer';

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
  contextItemsSerializable: {
    pageElementIndex: number;
    distance: number;
  }[];
  contextItems: TPageElementContextItem[];
}

export interface TPageElementContextItem {
  pageElement: TPageElement;
  distance: number;
}
export interface TPageElementContext {
  sourceElement: TPageElement;
  contextItems: TPageElementContextItem[];
}

export interface TPageElementContextSimilarityItem {
  a: TPageElementContextItem;
  b: TPageElementContextItem;
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

export type TPageElementsFinder = (pageElements: TPageElement[]) => TPageElement[];

export type TPageElementsFilter = (pageElement: TPageElement) => boolean;

export interface TBrowserModel {
  browser: puppeteer.Browser;
  browserSize: TDimensions;
  viewportSize: TDimensions;
}

export interface TPagePointerState {
  viewportPoint: TViewportPoint;
  pagePoint: TPagePoint;
  buttonMask: number;
}

export interface TPageState {
  pageStateVersion: number;
  pageElements: TPageElement[];
  mousePointer: TPagePointerState;
  pageScrollPagePoint: TPagePoint;
  viewportSize: TDimensions;
  windowInnerSize: TDimensions;
  windowScrollSize: TDimensions;
}

export interface TPageModel {
  browserModel: TBrowserModel;
  page: puppeteer.Page;
  getPageState: () => TPageState;
  waitForNextPageState: () => Promise<void>;
}
