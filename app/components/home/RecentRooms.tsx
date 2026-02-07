import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { RecentRoom } from "../../types";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  return `${hours}時間前`;
}

interface RecentRoomsProps {
  rooms: RecentRoom[];
  onRejoin: (roomId: string) => void;
  loading: boolean;
}

export default function RecentRooms({
  rooms,
  onRejoin,
  loading,
}: RecentRoomsProps) {
  if (rooms.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>最近の部屋</Text>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {rooms.map((room) => (
          <TouchableOpacity
            key={room.roomId}
            style={styles.row}
            onPress={() => onRejoin(room.roomId)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{room.roomCode}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.templateName}>{room.templateName}</Text>
              <Text style={styles.time}>
                {formatRelativeTime(room.joinedAt)}
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.arrow}>›</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 400,
    marginTop: 32,
  },
  heading: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  scrollView: {
    maxHeight: 240,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  codeBadge: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 12,
  },
  codeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  info: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
  },
  time: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  arrow: {
    fontSize: 22,
    color: "#9ca3af",
    marginLeft: 8,
  },
});
