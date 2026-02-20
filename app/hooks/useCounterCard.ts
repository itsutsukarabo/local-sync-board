import { useState, useEffect, useRef } from "react";

/**
 * CounterCard のロジックを担うフック
 * - serverValue の変化をローカル状態に反映（編集中は除く）
 * - ボタン押下を受け取り localValue を即時更新
 * - 3秒デバウンス後に onCommit(baseValue, newValue) を呼び出す
 * - 競合時（conflictValue が返った場合）はローカル状態を強制上書き
 */
export function useCounterCard({
  serverValue,
  onCommit,
}: {
  serverValue: number;
  onCommit: (expectedValue: number, newValue: number) => Promise<{ conflictValue?: number }>;
}) {
  const [localValue, setLocalValue] = useState(serverValue);

  const serverValueRef = useRef(serverValue);
  const baseValueRef = useRef(serverValue);
  const localValueRef = useRef(serverValue);
  const isEditingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // サーバー値が更新されたとき（Realtime経由）
  useEffect(() => {
    serverValueRef.current = serverValue;
    if (!isEditingRef.current) {
      baseValueRef.current = serverValue;
      localValueRef.current = serverValue;
      setLocalValue(serverValue);
    }
  }, [serverValue]);

  const handlePress = (delta: number) => {
    if (!isEditingRef.current) {
      // 編集セッション開始: この時点のサーバー値を CAS の expected として記録
      baseValueRef.current = serverValueRef.current;
      isEditingRef.current = true;
    }
    const next = localValueRef.current + delta;
    localValueRef.current = next;
    setLocalValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      isEditingRef.current = false;
      if (localValueRef.current !== serverValueRef.current) {
        const result = await onCommit(baseValueRef.current, localValueRef.current);
        if (result.conflictValue !== undefined) {
          // 競合: DB の現在値に強制同期
          serverValueRef.current = result.conflictValue;
          baseValueRef.current = result.conflictValue;
          localValueRef.current = result.conflictValue;
          setLocalValue(result.conflictValue);
        }
      }
    }, 3000);
  };

  return { localValue, handlePress };
}
