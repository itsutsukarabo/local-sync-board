/**
 * PlayerList コンポーネント
 * プレイヤー一覧を表示
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import PlayerCard from "./PlayerCard";
import { GameState, Variable } from "../../types";

interface PlayerListProps {
  gameState: GameState;
  variables: Variable[];
  currentUserId: string | undefined;
  hostUserId: string;
}

export default function PlayerList({
  gameState,
  variables,
  currentUserId,
  hostUserId,
}: PlayerListProps) {
  const players = Object.keys(gameState);

  if (players.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.emptyText}>まだプレイヤーがいません</Text>
        <Text style={styles.emptySubtext}>
          ルームコードを共有して参加を待ちましょう
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>プレイヤー</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{players.length}人</Text>
        </View>
      </View>

      <View style={styles.playerList}>
        {players.map((playerId) => (
          <PlayerCard
            key={playerId}
            playerId={playerId}
            playerState={gameState[playerId]}
            variables={variables}
            isCurrentUser={playerId === currentUserId}
            isHost={playerId === hostUserId}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  badge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
  },
  playerList: {
    gap: 12,
  },
  emptyState: {
    padding: 48,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 8,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
});
