import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppPaths {
  configDir: string;
  dataDir: string;
  logDir: string;
}

export function getAppPaths(appName = 'webcamo'): AppPaths {
  const home = homedir();
  const slug = appName.toLowerCase();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    return {
      configDir: join(appData, appName),
      dataDir: join(localAppData, appName),
      logDir: join(localAppData, appName, 'logs'),
    };
  }

  if (process.platform === 'darwin') {
    const base = join(home, 'Library', 'Application Support', appName);
    return {
      configDir: base,
      dataDir: base,
      logDir: join(home, 'Library', 'Logs', appName),
    };
  }

  // Linux / XDG
  const configHome = process.env.XDG_CONFIG_HOME || join(home, '.config');
  const dataHome = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  return {
    configDir: join(configHome, slug),
    dataDir: join(dataHome, slug),
    logDir: join(dataHome, slug),
  };
}

export const defaultPaths = () => getAppPaths('webcamo');

