import React from "react";
import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ToastItem } from "../../hooks/useToast";

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export default function Toast({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <Animated.View
          key={toast.id}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <TouchableOpacity
            style={[
              styles.toast,
              toast.type === "success" ? styles.success : styles.error,
            ]}
            activeOpacity={0.8}
            onPress={() => onDismiss(toast.id)}
          >
            <Text style={styles.message}>{toast.message}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    right: 12,
    alignItems: "flex-end",
    gap: 6,
  },
  toast: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  success: {
    backgroundColor: "#10b981",
  },
  error: {
    backgroundColor: "#ef4444",
  },
  message: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
