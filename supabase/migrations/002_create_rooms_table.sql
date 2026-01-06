-- ============================================
-- rooms テーブルの作成
-- ゲームセッション（ルーム）を管理するテーブル
-- ============================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  template JSONB NOT NULL DEFAULT '{"variables": [], "actions": []}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host_user_id ON public.rooms(host_user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON public.rooms(created_at DESC);

-- ============================================
-- RLS (Row Level Security) ポリシーの設定
-- ============================================

-- RLSを有効化
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ポリシー1: 誰でもルームコードを知っていれば参照可能
CREATE POLICY "Anyone can view rooms with room_code"
  ON public.rooms
  FOR SELECT
  USING (true);

-- ポリシー2: 認証済みユーザーはルームを作成可能
CREATE POLICY "Authenticated users can create rooms"
  ON public.rooms
  FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);

-- ポリシー3: ホストユーザーは自分のルームを更新可能
CREATE POLICY "Host can update their own rooms"
  ON public.rooms
  FOR UPDATE
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

-- ポリシー4: ホストユーザーは自分のルームを削除可能
CREATE POLICY "Host can delete their own rooms"
  ON public.rooms
  FOR DELETE
  USING (auth.uid() = host_user_id);

-- ============================================
-- Realtime の有効化
-- ============================================

-- roomsテーブルのRealtimeを有効化
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- ============================================
-- ヘルパー関数: ユニークなルームコード生成
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 紛らわしい文字を除外
  i INTEGER;
BEGIN
  LOOP
    -- 4文字のランダムな英数字を生成
    new_code := '';
    FOR i IN 1..4 LOOP
      new_code := new_code || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    END LOOP;
    
    -- コードが既に存在するかチェック
    SELECT EXISTS(SELECT 1 FROM public.rooms WHERE room_code = new_code) INTO code_exists;
    
    -- 存在しなければループを抜ける
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- ============================================
-- コメント追加
-- ============================================

COMMENT ON TABLE public.rooms IS 'ゲームセッション（ルーム）を管理するテーブル';
COMMENT ON COLUMN public.rooms.id IS 'ルームの一意識別子';
COMMENT ON COLUMN public.rooms.room_code IS '4文字の参加用ショートコード（英数字）';
COMMENT ON COLUMN public.rooms.host_user_id IS 'ルームを作成したホストユーザーのID';
COMMENT ON COLUMN public.rooms.status IS 'ルームの状態: waiting(待機中), playing(プレイ中), finished(終了)';
COMMENT ON COLUMN public.rooms.template IS 'ゲームテンプレート定義（変数とアクション）';
COMMENT ON COLUMN public.rooms.current_state IS '全プレイヤーの現在の状態';
COMMENT ON COLUMN public.rooms.created_at IS 'ルーム作成日時';
