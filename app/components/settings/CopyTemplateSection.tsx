/**
 * テンプレートコピーセクション
 * 過去に作成した同じレイアウトのルームのテンプレートを現在のルームに適用する
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Room } from "../../types";
import { fetchMyPastRooms, updateTemplate } from "../../lib/roomApi";

interface CopyTemplateSectionProps {
  room: Room;
}

type PastRoom = Pick<Room, "id" | "room_name" | "room_code" | "template" | "created_at">;

export default function CopyTemplateSection({ room }: CopyTemplateSectionProps) {
  const [fetchingRooms, setFetchingRooms] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [pastRooms, setPastRooms] = useState<PastRoom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const handleOpenModal = async () => {
    setFetchingRooms(true);
    try {
      const layoutMode = room.template.layoutMode ?? "list";
      const { rooms, error } = await fetchMyPastRooms(room.id, layoutMode);
      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }
      if (rooms.length === 0) {
        Alert.alert("情報", "過去に作成したルームが見つかりません");
        return;
      }
      setPastRooms(rooms);
      setSelectedId(null);
      setModalVisible(true);
    } finally {
      setFetchingRooms(false);
    }
  };

  const handleApply = () => {
    if (!selectedId) return;

    Alert.alert(
      "コピーの確認",
      "現在の設定が上書きされます。よろしいですか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "コピー実行",
          style: "destructive",
          onPress: executeApply,
        },
      ]
    );
  };

  const executeApply = async () => {
    const selectedRoom = pastRooms.find((r) => r.id === selectedId);
    if (!selectedRoom) return;

    setApplying(true);
    try {
      const { error } = await updateTemplate(room.id, selectedRoom.template);
      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        setModalVisible(false);
      }
    } finally {
      setApplying(false);
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.openBtn, fetchingRooms && styles.openBtnDisabled]}
        onPress={handleOpenModal}
        disabled={fetchingRooms}
      >
        {fetchingRooms ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.openBtnText}>過去のテンプレートをコピー</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>コピー元のルームを選択</Text>

            <FlatList
              data={pastRooms}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.listItem, isSelected && styles.listItemSelected]}
                    onPress={() => setSelectedId(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.listItemContent}>
                      <Text style={styles.listItemName}>
                        {item.room_name || item.room_code}
                      </Text>
                      <Text style={styles.listItemDate}>{formatDate(item.created_at)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={applying}
              >
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.applyBtn,
                  (!selectedId || applying) && styles.applyBtnDisabled,
                ]}
                onPress={handleApply}
                disabled={!selectedId || applying}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.applyBtnText}>コピー実行</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  openBtn: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  openBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  openBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
  },
  list: {
    maxHeight: 300,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  listItemSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioSelected: {
    borderColor: "#3b82f6",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3b82f6",
  },
  listItemContent: {
    flex: 1,
  },
  listItemName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1f2937",
  },
  listItemDate: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  cancelBtnText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  applyBtn: {
    flex: 1,
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  applyBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  applyBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
