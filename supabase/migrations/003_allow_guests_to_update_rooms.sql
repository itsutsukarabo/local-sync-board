-- ============================================
-- ゲストユーザーもルームの current_state を更新できるようにする
-- ============================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Host can update their own rooms" ON public.rooms;

-- 新しいポリシー: 認証済みユーザーは誰でもルームを更新可能
-- （ただし、ホスト以外は current_state のみ更新可能にする制約は別途アプリ側で管理）
CREATE POLICY "Authenticated users can update rooms"
  ON public.rooms
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- コメント
COMMENT ON POLICY "Authenticated users can update rooms" ON public.rooms IS 
  '認証済みユーザーは誰でもルームを更新可能（プレイヤー参加のため）';
