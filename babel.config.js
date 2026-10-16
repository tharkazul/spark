// React Native's LogBox (RN 0.86+) styles its buttons with a Pressable `style`
// function, which NativeWind's JSX wrapper drops — the warning toast renders as
// a blank white bar. LogBox never uses className, so it skips NativeWind.
// A function, not a RegExp: Expo's cache-key pass loads this config without a
// filename, and Babel rejects RegExp patterns in that case.
const LOGBOX = (filename) =>
  !!filename && /node_modules[\\/]react-native[\\/]Libraries[\\/]LogBox[\\/]/.test(filename);

module.exports = function (api) {
  api.cache(true);
  return {
    overrides: [
      {
        exclude: LOGBOX,
        presets: [
          ["babel-preset-expo", { jsxImportSource: "nativewind" }],
          "nativewind/babel",
        ],
      },
      {
        test: LOGBOX,
        presets: ["babel-preset-expo"],
      },
    ],
    plugins: [
      "react-native-reanimated/plugin",
    ],
  };
};
