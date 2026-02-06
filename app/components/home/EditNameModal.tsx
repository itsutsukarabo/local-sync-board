import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

interface EditNameModalProps {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
}

/**
 * ニックネーム編集モーダル
 */
export default function EditNameModal({
  visible,
  currentName,
  onClose,
  onSave,
}: EditNameModalProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // モーダルが開くたびに現在の名前をセット
  useEffect(() => {
    if (visible) {
      setName(currentName);
      setError(null);
    }
  }, [visible, currentName]);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "ニックネームを入力してください";
    if (trimmed.length < 2) return "2文字以上で入力してください";
    if (trimmed.length > 20) return "20文字以内で入力してください";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName === currentName) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (e) {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length >= 2 && name.trim().length <= 20;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <Text style={styles.title}>ニックネーム変更</Text>

          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="ニックネーム"
            placeholderTextColor="#9ca3af"
            maxLength={20}
            autoFocus
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.hint}>2〜20文字で入力してください</Text>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                (!canSave || saving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  hint: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 8,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    color: "#ef4444",
    marginTop: 8,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
