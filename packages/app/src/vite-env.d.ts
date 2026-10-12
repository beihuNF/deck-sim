/// <reference types="vite/client" />
/** Set by vite.config.ts at build time; versions the offline cache. */
declare const __BUILD_ID__: string;
declare const __ASSETS_ID__: string;

declare module 'browser-tool' {
  export interface BrowserParseResult {
    browser?: string;
    browserVersion?: string;
    engine?: string;
    engineVersion?: string;
    system?: string;
    systemVersion?: string;
    platform?: string;
    architecture?: string;
    bitness?: number;
    device?: string;
    isWebview?: boolean;
    isRobot?: boolean;
    [key: string]: unknown;
  }

  export interface BrowserDetailInfo extends BrowserParseResult {
    gpu?: string;
    gpuModel?: string;
    screenFPS?: number;
    screenWidth?: number;
    screenHeight?: number;
    screenOrientation?: string;
    clientWidth?: number;
    clientHeight?: number;
    devicePixelRatio?: number;
    deviceMemory?: number;
    language?: string;
    network?: string;
    timezone?: string;
    isTouch?: boolean;
    userAgent?: string;
    [key: string]: unknown;
  }

  export function parse(userAgent?: string): BrowserParseResult;
  export function getInfo(fields?: string[]): Promise<BrowserDetailInfo>;
  export function isSupport(type: string, value?: string): boolean;
  export function getFingerprint(): Promise<{ value: string; [key: string]: unknown }>;

  const browser: {
    parse: typeof parse;
    getInfo: typeof getInfo;
    isSupport: typeof isSupport;
    getFingerprint: typeof getFingerprint;
  };
  export default browser;
}
