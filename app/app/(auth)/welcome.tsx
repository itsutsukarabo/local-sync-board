import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

/**
 * Welcome画面
 * 初回起動時にニックネームを入力
 */
export default function WelcomeScreen() {
  const [nickname, setNickname] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateProfile } = useAuth();
  const router = useRouter();

  /**
   * ニックネーム保存処理
   */
  const handleSubmit = async () => {
    // バリデーション
    if (!nickname.trim()) {
      Alert.alert("エラー", "ニックネームを入力してください");
      return;
    }

    if (nickname.trim().length < 2) {
      Alert.alert("エラー", "ニックネームは2文字以上で入力してください");
      return;
    }

    if (nickname.trim().length > 20) {
      Alert.alert("エラー", "ニックネームは20文字以内で入力してください");
      return;
    }

    try {
      setIsSubmitting(true);

      // プロファイルを更新
      await updateProfile({
        display_name: nickname.trim(),
      });

      // ホーム画面へ遷移
      router.replace("/");
    } catch (error) {
      console.error("ニックネーム保存エラー:", error);
      Alert.alert(
        "エラー",
        "ニックネームの保存に失敗しました。もう一度お試しください。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* タイトル */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>ようこそ！</Text>
          <Text style={styles.subtitle}>
            Local Sync Boardへようこそ{"\n"}
            まずはニックネームを設定しましょう
          </Text>
        </View>

        {/* 入力フォーム */}
        <View style={styles.formContainer}>
          <Text style={styles.label}>ニックネーム</Text>
          <TextInput
            style={styles.input}
            placeholder="例: プレイヤー1"
            placeholderTextColor="#9ca3af"
            value={nickname}
            onChangeText={setNickname}
            maxLength={20}
            autoFocus
            editable={!isSubmitting}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Text style={styles.hint}>2〜20文字で入力してください</Text>
        </View>

        {/* 送信ボタン */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!nickname.trim() || isSubmitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!nickname.trim() || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>はじめる</Text>
          )}
        </TouchableOpacity>

        {/* フッター */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ニックネームは後から変更できます
          </Text>
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
    paddingHorizontal: 24,
  },
  titleContainer: {
    marginBottom: 48,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
  formContainer: {
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
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
  },
  hint: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
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
  submitButtonDisabled: {
    backgroundColor: "#9ca3af",
    shadowOpacity: 0.1,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
});
