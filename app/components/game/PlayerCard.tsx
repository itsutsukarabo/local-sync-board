/**
 * PlayerCard コンポーネント
 * 個別プレイヤーの情報を表示するカード
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Variable, PlayerState } from "../../types";

interface PlayerCardProps {
  playerId: string;
  playerState: PlayerState;
  variables: Variable[];
  isCurrentUser: boolean;
  isHost: boolean;
}

export default function PlayerCard({
  playerId,
  playerState,
  variables,
  isCurrentUser,
  isHost,
}: PlayerCardProps) {
  return (
    <View style={styles.card}>
      {/* プレイヤーヘッダー */}
      <View style={styles.header}>
        <Text style={styles.playerName}>
          {isCurrentUser ? "あなた" : `プレイヤー ${playerId.slice(0, 8)}`}
          {isHost && " 👑"}
        </Text>
        {playerState._status && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{playerState._status}</Text>
          </View>
        )}
      </View>

      {/* スコア表示 */}
      <View style={styles.statsContainer}>
        {variables.map((variable) => (
          <View key={variable.key} style={styles.statItem}>
            <Text style={styles.statLabel}>{variable.label}</Text>
            <Text style={styles.statValue}>
              {playerState[variable.key] ?? variable.initial}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  statusBadge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    color: "#1e40af",
    fontWeight: "500",
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: 100,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
});
