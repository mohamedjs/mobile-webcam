// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedSrc = path.resolve(monorepoRoot, 'packages/shared/src');

const config = getDefaultConfig(projectRoot);

// `mobile` is not an npm workspace of the root package, so Metro has to be
// pointed at the monorepo explicitly.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve `@mobile-webcam/shared` to its TypeScript source, not its gitignored
// dist/. A clean checkout (CI, EAS, the Gradle/Xcode bundle step) has neither
// the root workspace symlink nor a built dist, so the package must come from
// source. The shared package uses NodeNext-style `./foo.js` specifiers, which
// map to `./foo.ts` here.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (moduleName === '@mobile-webcam/shared') {
    return { type: 'sourceFile', filePath: path.join(sharedSrc, 'index.ts') };
  }
  if (
    context.originModulePath.startsWith(sharedSrc + path.sep) &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
