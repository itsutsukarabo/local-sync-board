import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* タイトル */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Local Sync Board</Text>
          <Text style={styles.subtitle}>リアルタイム共有ボードアプリ</Text>
        </View>

        {/* ボタンコンテナ */}
        <View style={styles.buttonContainer}>
          {/* 部屋を作るボタン */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/create-room")}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>部屋を作る</Text>
            <Text style={styles.primaryButtonSubtext}>Create Room</Text>
          </TouchableOpacity>

          {/* 部屋に入るボタン */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/join-room")}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>部屋に入る</Text>
            <Text style={styles.secondaryButtonSubtext}>Join Room</Text>
          </TouchableOpacity>
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Version 1.0.0</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  titleContainer: {
    marginBottom: 64,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 400,
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  primaryButtonSubtext: {
    color: "#dbeafe",
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  secondaryButtonText: {
    color: "#2563eb",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  secondaryButtonSubtext: {
    color: "#2563eb",
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    bottom: 32,
  },
  footerText: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
  },
});
