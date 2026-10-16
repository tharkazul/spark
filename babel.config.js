// React Native's LogBox (RN 0.86+) styles its buttons with a Pressable `style`
// function, which NativeWind's JSX wrapper drops — the warning toast renders as
// a blank white bar. LogBox never uses className, so it skips NativeWind.
const LOGBOX = /node_modules[\\/]react-native[\\/]Libraries[\\/]LogBox[\\/]/;

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
