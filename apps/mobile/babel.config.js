module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // `maplibre-gl`'s web bundle uses `static {}` class blocks, a syntax
      // babel-preset-expo's target does not parse on its own — the web build
      // fails at the first import with "Static class blocks are not
      // enabled." This is the standard fix, not a workaround for our code.
      '@babel/plugin-transform-class-static-block',
      // Reanimated's plugin must stay last.
      'react-native-reanimated/plugin',
    ],
  };
};
