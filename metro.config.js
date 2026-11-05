const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'mjs', 'cjs']));
// Local credentials are configuration, never JavaScript modules or web assets.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /[/\\]\.env(?:\.[^/\\]*)?$/,
  /[/\\]\.expo[/\\]local-secrets[/\\].*/,
];

module.exports = config;
