/**
 * プレイヤースコア編集コンポーネント
 * ホストが各プレイヤーの全変数を直接編集できるUI
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Variable, GameState, SeatInfo } from "../../types";
import { forceEditScore } from "../../lib/roomApi";

interface PlayerScoreEditorProps {
  roomId: string;
  players: string[];
  currentState: GameState;
  variables: Variable[];
  currentUserId?: string;
  seats: (SeatInfo | null)[];
}

export default function PlayerScoreEditor({
  roomId,
  players,
  currentState,
  variables,
  currentUserId,
  seats,
}: PlayerScoreEditorProps) {
  // playerId → variableKey → 入力文字列
  const [editValues, setEditValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const [savingPlayer, setSavingPlayer] = useState<string | null>(null);
  // 現在フォーカス中のフィールド（playerId:variableKey）
  const focusedField = useRef<string | null>(null);

  // currentStateからeditValuesを同期
  useEffect(() => {
    const newValues: Record<string, Record<string, string>> = {};
    for (const playerId of players) {
      const playerState = currentState[playerId];
      if (!playerState) continue;
      newValues[playerId] = {};
      for (const v of variables) {
        const fieldKey = `${playerId}:${v.key}`;
        // フォーカス中のフィールドは上書きしない
        if (focusedField.current === fieldKey && editValues[playerId]?.[v.key] !== undefined) {
          newValues[playerId][v.key] = editValues[playerId][v.key];
        } else {
          newValues[playerId][v.key] = String(
            (playerState[v.key] as number) ?? 0
          );
        }
      }
    }
    setEditValues(newValues);
  }, [currentState, players, variables]);

  const handleChange = (playerId: string, variableKey: string, text: string) => {
    // 数字とマイナス記号のみ許可（先頭のみマイナス可）
    const sanitized = text.replace(/[^0-9-]/g, "");
    const cleaned = sanitized.charAt(0) + sanitized.slice(1).replace(/-/g, "");
    setEditValues((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [variableKey]: cleaned,
      },
    }));
  };

  const hasChanges = (playerId: string): boolean => {
    const playerState = currentState[playerId];
    if (!playerState || !editValues[playerId]) return false;
    return variables.some((v) => {
      const current = (playerState[v.key] as number) ?? 0;
      const edited = editValues[playerId]?.[v.key] ?? String(current);
      return String(current) !== edited;
    });
  };

  const handleSave = async (playerId: string) => {
    const playerEdits = editValues[playerId];
    if (!playerEdits) return;

    // 変更された変数のみ抽出
    const updates: Record<string, number> = {};
    const playerState = currentState[playerId];
    for (const v of variables) {
      const current = (playerState?.[v.key] as number) ?? 0;
      const editedStr = playerEdits[v.key] ?? String(current);
      const edited = Number(editedStr);
      if (isNaN(edited)) {
        Alert.alert("エラー", `「${v.label}」に有効な数値を入力してください。`);
        return;
      }
      if (edited !== current) {
        updates[v.key] = edited;
      }
    }

    if (Object.keys(updates).length === 0) return;

    setSavingPlayer(playerId);
    try {
      const { error } = await forceEditScore(roomId, playerId, updates);
      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        Alert.alert("更新完了", "スコアを更新しました。");
      }
    } finally {
      setSavingPlayer(null);
    }
  };

  if (players.length === 0) {
    return (
      <Text style={styles.emptyText}>参加中のプレイヤーはいません</Text>
    );
  }

  return (
    <View>
      {players.map((playerId) => {
        const isSaving = savingPlayer === playerId;
        const changed = hasChanges(playerId);
        const seatInfo = seats.find((s) => s && s.userId === playerId);
        const stateDisplayName = currentState[playerId]?.__displayName__ as string | undefined;
        const baseName = seatInfo?.displayName || stateDisplayName || `${playerId.substring(0, 8)}...`;
        const displayName = playerId === currentUserId
          ? `${baseName} (あなた)`
          : baseName;

        return (
          <View key={playerId} style={styles.playerCard}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerName}>{displayName}</Text>
              <TouchableOpacity
                style={[
                  styles.updateBtn,
                  (!changed || isSaving) && styles.updateBtnDisabled,
                ]}
                onPress={() => handleSave(playerId)}
                disabled={!changed || isSaving}
              >
                <Text
                  style={[
                    styles.updateBtnText,
                    (!changed || isSaving) && styles.updateBtnTextDisabled,
                  ]}
                >
                  {isSaving ? "更新中..." : "更新"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.variablesGrid}>
              {variables.map((v) => (
                <View key={v.key} style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{v.label}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editValues[playerId]?.[v.key] ?? ""}
                    onChangeText={(text) => handleChange(playerId, v.key, text)}
                    onFocus={() => {
                      focusedField.current = `${playerId}:${v.key}`;
                    }}
                    onBlur={() => {
                      focusedField.current = null;
                    }}
                    keyboardType="numbers-and-punctuation"
                    selectTextOnFocus
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 12,
  },
  playerCard: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 12,
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  updateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#3b82f6",
  },
  updateBtnDisabled: {
    backgroundColor: "#e5e7eb",
  },
  updateBtnText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "600",
  },
  updateBtnTextDisabled: {
    color: "#9ca3af",
  },
  variablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    minWidth: 100,
  },
  inputLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#f9fafb",
  },
});
