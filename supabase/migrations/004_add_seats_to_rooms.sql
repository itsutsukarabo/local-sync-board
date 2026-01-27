-- 座席情報を rooms テーブルに追加
-- seats: 座席配列 [Bottom(0), Right(1), Top(2), Left(3)]

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS seats JSONB DEFAULT '[]'::jsonb;

-- 既存のルームに空の座席配列を設定
UPDATE rooms
SET seats = '[]'::jsonb
WHERE seats IS NULL OR seats = 'null'::jsonb;
