import type { Logger } from '../../kernel/logging/logger.js';
import {
  launchNativeWindow,
  openFallbackBrowser,
  findChromiumBrowsers,
  NativeWindowLauncher,
} from './infrastructure/NativeWindowLauncher.js';

export { NativeWindowLauncher, launchNativeWindow, openFallbackBrowser, findChromiumBrowsers };

export interface WindowModuleDeps {
  log: Logger;
  dataDir: string;
}

export class WindowModule {
  readonly #log: Logger;
  readonly #dataDir: string;

  constructor(deps: WindowModuleDeps) {
    this.#log = deps.log.child({ module: 'window' });
    this.#dataDir = deps.dataDir;
  }

  launch(url: string): void {
    launchNativeWindow(url, this.#dataDir, this.#log);
  }

  openBrowser(url: string): void {
    openFallbackBrowser(url, this.#log);
  }

  openAppWindowOrBrowser(url: string): void {
    this.launch(url);
  }

  get availableBrowsers(): string[] {
    return findChromiumBrowsers();
  }
}
