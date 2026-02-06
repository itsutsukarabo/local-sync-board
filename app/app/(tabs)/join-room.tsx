import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { joinRoom } from "../../lib/roomApi";
import { saveRecentRoom } from "../../lib/recentRooms";

export default function JoinRoomScreen() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinRoom = async () => {
    // 入力チェック
    if (!roomCode.trim()) {
      Alert.alert("エラー", "ルームコードを入力してください");
      return;
    }

    // 4桁の英数字チェック
    const cleanCode = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(cleanCode)) {
      Alert.alert("エラー", "ルームコードは4桁の英数字で入力してください");
      return;
    }

    setLoading(true);

    try {
      const { room, error } = await joinRoom(cleanCode);

      if (error) {
        Alert.alert("参加失敗", error.message);
        return;
      }

      if (!room) {
        Alert.alert("エラー", "ルームが見つかりませんでした");
        return;
      }

      await saveRecentRoom({
        roomId: room.id,
        roomCode: room.room_code,
        joinedAt: Date.now(),
        templateName:
          room.template?.layoutMode === "mahjong"
            ? "麻雀"
            : "シンプルスコア",
      });

      // ゲーム画面に遷移
      router.push(`/game/${room.id}`);
    } catch (error) {
      console.error("Join room error:", error);
      Alert.alert("エラー", "ルームへの参加に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>ルームに参加</Text>
            <Text style={styles.subtitle}>
              ホストから共有されたルームコードを入力してください
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>ルームコード</Text>
            <TextInput
              style={styles.input}
              value={roomCode}
              onChangeText={setRoomCode}
              placeholder="例: AB23"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              maxLength={4}
              editable={!loading}
            />
            <Text style={styles.hint}>4桁の英数字を入力してください</Text>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleJoinRoom}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>参加する</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💡 ヒント</Text>
            <Text style={styles.infoText}>
              • ルームコードはホストが作成時に表示されます
            </Text>
            <Text style={styles.infoText}>
              • 大文字・小文字は区別されません
            </Text>
            <Text style={styles.infoText}>
              • ルームが見つからない場合は、コードを確認してください
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 24,
  },
  form: {
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    color: "#1f2937",
    fontWeight: "600",
    letterSpacing: 2,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
  },
  button: {
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: "#93c5fd",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1e40af",
    marginBottom: 4,
    lineHeight: 20,
  },
});
