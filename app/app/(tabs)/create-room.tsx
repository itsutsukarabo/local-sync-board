import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { createRoom } from "../../lib/roomApi";
import {
  TEMPLATE_PRESETS,
  TEMPLATE_LABELS,
  PERMISSION_LABELS,
} from "../../utils/roomUtils";
import { GameTemplate } from "../../types";

export default function CreateRoomScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("mahjong");

  const handleCreateRoom = async () => {
    try {
      setLoading(true);

      // 選択されたテンプレートを取得
      const template: GameTemplate =
        TEMPLATE_PRESETS[selectedTemplate as keyof typeof TEMPLATE_PRESETS];

      if (!template) {
        Alert.alert("エラー", "テンプレートが選択されていません");
        return;
      }

      // ルームを作成
      const { room, error } = await createRoom(template);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      if (!room) {
        Alert.alert("エラー", "ルームの作成に失敗しました");
        return;
      }

      // ゲーム画面に遷移
      router.push(`/game/${room.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      Alert.alert("エラー", "ルームの作成中に問題が発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>ルームを作成</Text>
          <Text style={styles.subtitle}>
            ゲームテンプレートを選択してルームを作成します
          </Text>

          {/* テンプレート選択 */}
          <View style={styles.templateSection}>
            <Text style={styles.sectionTitle}>ゲームテンプレート</Text>

            {Object.entries(TEMPLATE_PRESETS).map(([key, template]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.templateCard,
                  selectedTemplate === key && styles.templateCardSelected,
                ]}
                onPress={() => setSelectedTemplate(key)}
                disabled={loading}
              >
                <View style={styles.templateCardHeader}>
                  <View
                    style={[
                      styles.radio,
                      selectedTemplate === key && styles.radioSelected,
                    ]}
                  >
                    {selectedTemplate === key && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.templateTitle,
                      selectedTemplate === key && styles.templateTitleSelected,
                    ]}
                  >
                    {TEMPLATE_LABELS[key]}
                  </Text>
                </View>

                <View style={styles.templateDetails}>
                  <Text style={styles.templateDetailLabel}>変数:</Text>
                  {template.variables.map((variable, index) => (
                    <Text key={index} style={styles.templateDetailText}>
                      • {variable.label} (初期値: {variable.initial})
                    </Text>
                  ))}

                  <Text style={[styles.templateDetailLabel, { marginTop: 8 }]}>
                    許可された操作:
                  </Text>
                  {template.permissions.map((permission, index) => (
                    <Text key={index} style={styles.templateDetailText}>
                      • {PERMISSION_LABELS[permission] || permission}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* 作成ボタン */}
          <TouchableOpacity
            style={[
              styles.createButton,
              loading && styles.createButtonDisabled,
            ]}
            onPress={handleCreateRoom}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.createButtonText}>ルームを作成</Text>
            )}
          </TouchableOpacity>

          {/* 説明テキスト */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              💡 ルームを作成すると、4文字のルームコードが発行されます。
            </Text>
            <Text style={styles.infoText}>
              このコードを他のプレイヤーに共有して、ルームに参加してもらいましょう。
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
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
    marginBottom: 24,
  },
  templateSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  templateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  templateCardSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  templateCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioSelected: {
    borderColor: "#3b82f6",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3b82f6",
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  templateTitleSelected: {
    color: "#1e40af",
  },
  templateDetails: {
    paddingLeft: 36,
  },
  templateDetailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563",
    marginBottom: 4,
  },
  templateDetailText: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  createButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  createButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  infoText: {
    fontSize: 14,
    color: "#92400e",
    marginBottom: 4,
  },
});
