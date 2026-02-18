/**
 * expo-haptics の Vitest 用スタブ
 */

export const ImpactFeedbackStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
};

export function impactAsync(_style?: string) {
  return Promise.resolve();
}
