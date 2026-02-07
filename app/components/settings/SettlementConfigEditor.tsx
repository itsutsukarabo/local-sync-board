/**
 * 精算設定エディタ
 * 割る数・順位点の設定を行う
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { SettlementConfig } from "../../types";

interface SettlementConfigEditorProps {
  config: SettlementConfig;
  onUpdate: (config: SettlementConfig) => void;
  scoreInitial: number;
}

export default function SettlementConfigEditor({
  config,
  onUpdate,
  scoreInitial,
}: SettlementConfigEditorProps) {
  const [divider, setDivider] = useState(String(config.divider));
  // 最下位は自動計算のため、編集可能なのは上位のみ
  const [rank3, setRank3] = useState(config.rankBonuses[3].slice(0, 2).map(String));
  const [rank4, setRank4] = useState(config.rankBonuses[4].slice(0, 3).map(String));

  const focusedField = useRef<string | null>(null);

  // 最下位の順位点を自動計算: -(scoreInitial * 人数) - (上位の合計)
  const calcLastRankBonus = (upperBonuses: string[], playerCount: number): number => {
    const total = -(scoreInitial * playerCount);
    const upperSum = upperBonuses.reduce((sum, s) => {
      const n = parseInt(s, 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    return total - upperSum;
  };

  // props変更時にローカルstateを同期（フォーカス中フィールドは除外）
  useEffect(() => {
    if (focusedField.current !== "divider") {
      setDivider(String(config.divider));
    }
    setRank3((prev) =>
      config.rankBonuses[3].slice(0, 2).map((v, i) =>
        focusedField.current === `rank3:${i}` ? prev[i] : String(v)
      )
    );
    setRank4((prev) =>
      config.rankBonuses[4].slice(0, 3).map((v, i) =>
        focusedField.current === `rank4:${i}` ? prev[i] : String(v)
      )
    );
  }, [config]);

  const emitUpdate = useCallback(
    (newDivider: string, newRank3: string[], newRank4: string[]) => {
      const d = parseInt(newDivider, 10);
      if (isNaN(d) || d < 1) return;

      const r3 = newRank3.map((s) => parseInt(s, 10));
      const r4 = newRank4.map((s) => parseInt(s, 10));
      if (r3.some(isNaN) || r4.some(isNaN)) return;

      // 最下位を自動計算して付加
      const last3 = -(scoreInitial * 3) - r3.reduce((a, b) => a + b, 0);
      const last4 = -(scoreInitial * 4) - r4.reduce((a, b) => a + b, 0);

      onUpdate({
        divider: d,
        rankBonuses: { 3: [...r3, last3], 4: [...r4, last4] },
      });
    },
    [onUpdate, scoreInitial]
  );

  const handleDividerChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setDivider(cleaned);
    emitUpdate(cleaned, rank3, rank4);
  };

  const handleRankChange = (
    group: "rank3" | "rank4",
    index: number,
    text: string
  ) => {
    // 負値・空文字・マイナス記号のみ許可
    const cleaned = text.replace(/[^0-9\-]/g, "");
    if (group === "rank3") {
      const updated = [...rank3];
      updated[index] = cleaned;
      setRank3(updated);
      emitUpdate(divider, updated, rank4);
    } else {
      const updated = [...rank4];
      updated[index] = cleaned;
      setRank4(updated);
      emitUpdate(divider, rank3, updated);
    }
  };

  const rankLabels = ["1位", "2位", "3位", "4位"];

  return (
    <View>
      {/* 割る数 */}
      <View style={styles.row}>
        <Text style={styles.label}>割る数</Text>
        <TextInput
          style={styles.numberInput}
          value={divider}
          onChangeText={handleDividerChange}
          onFocus={() => { focusedField.current = "divider"; }}
          onBlur={() => { focusedField.current = null; }}
          keyboardType="number-pad"
          maxLength={6}
        />
      </View>

      {/* 3人時の順位点 */}
      <View style={styles.rankSection}>
        <Text style={styles.rankTitle}>3人時の順位点</Text>
        {rank3.map((val, i) => (
          <View key={`rank3-${i}`} style={styles.rankRow}>
            <Text style={styles.rankLabel}>{rankLabels[i]}</Text>
            <TextInput
              style={styles.numberInput}
              value={val}
              onChangeText={(text) => handleRankChange("rank3", i, text)}
              onFocus={() => { focusedField.current = `rank3:${i}`; }}
              onBlur={() => { focusedField.current = null; }}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        ))}
        {/* 最下位（自動計算・編集不可） */}
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>{rankLabels[2]}</Text>
          <Text style={styles.computedValue}>
            {calcLastRankBonus(rank3, 3)}
          </Text>
        </View>
      </View>

      {/* 4人時の順位点 */}
      <View style={styles.rankSection}>
        <Text style={styles.rankTitle}>4人時の順位点</Text>
        {rank4.map((val, i) => (
          <View key={`rank4-${i}`} style={styles.rankRow}>
            <Text style={styles.rankLabel}>{rankLabels[i]}</Text>
            <TextInput
              style={styles.numberInput}
              value={val}
              onChangeText={(text) => handleRankChange("rank4", i, text)}
              onFocus={() => { focusedField.current = `rank4:${i}`; }}
              onBlur={() => { focusedField.current = null; }}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        ))}
        {/* 最下位（自動計算・編集不可） */}
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>{rankLabels[3]}</Text>
          <Text style={styles.computedValue}>
            {calcLastRankBonus(rank4, 4)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  numberInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: "#1f2937",
    width: 100,
    textAlign: "right",
    backgroundColor: "#f9fafb",
  },
  rankSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 12,
  },
  rankTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  rankLabel: {
    fontSize: 14,
    color: "#374151",
  },
  computedValue: {
    width: 100,
    textAlign: "right",
    fontSize: 15,
    color: "#9ca3af",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
