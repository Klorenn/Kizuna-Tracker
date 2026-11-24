const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedSrc = path.resolve(projectRoot, "../src");

const config = getDefaultConfig(projectRoot);

// Shared code lives in ../src (the Next app). It is NOT an npm workspace: the root node_modules ships React 19.1 for
// Next, so every package must resolve from mobile/node_modules only.
config.watchFolders = [...(config.watchFolders ?? []), sharedSrc];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
