/**
 * react-native の Vitest 用スタブ
 * Vite/Rollup が Flow 構文の react-native/index.js をパースできない問題を回避
 */

export const Alert = {
  alert: (..._args: any[]) => {},
};

export const Platform = {
  OS: "web" as string,
};

export const AppState = {
  addEventListener: (_event: string, _handler: any) => ({
    remove: () => {},
  }),
};

export const BackHandler = {
  addEventListener: (_event: string, _handler: any) => ({
    remove: () => {},
  }),
};

export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => styles,
};
