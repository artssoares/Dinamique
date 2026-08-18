// Metro must be told about the monorepo: packages live outside the app folder
// and are consumed as TypeScript source, not as built output.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm's symlinked store means a package can otherwise be resolved twice.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
