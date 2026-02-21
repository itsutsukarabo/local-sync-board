/**
 * コホスト（追加ホスト）管理コンポーネント
 * 着席中プレイヤーに対してホスト権限を付与・剥奪する
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Room } from "../../types";
import { updateCoHosts } from "../../lib/roomApi";

interface CoHostEditorProps {
  room: Room;
  onSaved?: () => void;
}

export default function CoHostEditor({ room, onSaved }: CoHostEditorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(room.co_host_ids ?? [])
  );
  const [saving, setSaving] = useState(false);

  // 着席中の非ホスト・非架空ユーザーのみ表示
  const eligibleSeats = room.seats.filter(
    (s) => s && !s.isFake && s.userId && s.userId !== room.host_user_id
  ) as NonNullable<(typeof room.seats)[number]>[];

  const toggleId = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await updateCoHosts(room.id, Array.from(selectedIds));
      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        Alert.alert("保存完了", "ホスト権限を更新しました。");
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  };

  if (eligibleSeats.length === 0) {
    return (
      <Text style={styles.emptyText}>
        ホスト権限を付与できるプレイヤーがいません
      </Text>
    );
  }

  return (
    <View>
      {eligibleSeats.map((seat) => {
        const userId = seat.userId!;
        const checked = selectedIds.has(userId);
        const displayName = seat.displayName || userId;
        return (
          <TouchableOpacity
            key={userId}
            style={styles.checkboxRow}
            onPress={() => toggleId(userId)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{displayName}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={[styles.saveBtnText, saving && styles.saveBtnTextDisabled]}>
          {saving ? "保存中..." : "保存"}
        </Text>
      </TouchableOpacity>
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 15,
    color: "#374151",
    flex: 1,
  },
  saveBtn: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  saveBtnDisabled: {
    backgroundColor: "#e5e7eb",
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtnTextDisabled: {
    color: "#9ca3af",
  },
});
