-- ============================================
-- Phase 7.4: DB側 RPC による原子的更新
-- plpgsql RPC 関数で Read-Modify-Write を原子化
-- ============================================

-- ============================================
-- ヘルパー関数（内部用）
-- ============================================

-- 1. _build_snapshot: 予約キーを除去したスナップショットを返す
CREATE OR REPLACE FUNCTION public._build_snapshot(state JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN state - '__recent_log__' - '__writeId__' - '__history__' - '__settlements__';
END;
$$;

-- 2. _push_recent_log: __recent_log__ リングバッファ更新（最大5件）
CREATE OR REPLACE FUNCTION public._push_recent_log(state JSONB, msg TEXT)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  log_arr JSONB;
  new_entry JSONB;
BEGIN
  log_arr := COALESCE(state->'__recent_log__', '[]'::jsonb);
  new_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'timestamp', (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    'message', msg
  );
  log_arr := log_arr || jsonb_build_array(new_entry);
  -- 最大5件を保持
  IF jsonb_array_length(log_arr) > 5 THEN
    log_arr := (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(log_arr) AS elem
        ORDER BY (elem->>'timestamp')::bigint ASC
        OFFSET (jsonb_array_length(log_arr) - 5)
      ) sub
    );
  END IF;
  RETURN jsonb_set(state, '{__recent_log__}', log_arr);
END;
$$;

-- 3. _ensure_seated_players: 着席中プレイヤーの初期値補完
CREATE OR REPLACE FUNCTION public._ensure_seated_players(
  restored JSONB,
  seats JSONB,
  tpl_vars JSONB,
  old_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  result JSONB := restored;
  seat JSONB;
  uid TEXT;
  v JSONB;
  init_state JSONB;
  k TEXT;
BEGIN
  -- 1. 着席中プレイヤーの補完
  IF seats IS NOT NULL THEN
    FOR seat IN SELECT * FROM jsonb_array_elements(seats)
    LOOP
      IF seat IS NOT NULL AND seat != 'null'::jsonb AND seat ? 'userId' THEN
        uid := seat->>'userId';
        IF uid IS NOT NULL AND NOT result ? uid THEN
          init_state := '{}'::jsonb;
          FOR v IN SELECT * FROM jsonb_array_elements(tpl_vars)
          LOOP
            init_state := jsonb_set(init_state, ARRAY[v->>'key'], v->'initial');
          END LOOP;
          result := jsonb_set(result, ARRAY[uid], init_state);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2. old_state に存在するプレイヤーの補完（離席者データ保持）
  IF old_state IS NOT NULL THEN
    FOR k IN SELECT jsonb_object_keys(old_state)
    LOOP
      IF NOT k LIKE '__%__' AND NOT result ? k THEN
        result := jsonb_set(result, ARRAY[k], old_state->k);
      END IF;
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

-- 4. _get_variable_label: 変数キーからラベル取得
CREATE OR REPLACE FUNCTION public._get_variable_label(tpl_vars JSONB, var_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v JSONB;
BEGIN
  FOR v IN SELECT * FROM jsonb_array_elements(tpl_vars)
  LOOP
    IF v->>'key' = var_key THEN
      RETURN v->>'label';
    END IF;
  END LOOP;
  RETURN var_key;
END;
$$;


-- ============================================
-- RPC 関数（7個）
-- ============================================

-- -----------------------------------------------
-- rpc_transfer_score: スコア移動（Pot対応、残高チェック）
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_transfer_score(
  p_room_id UUID,
  p_from_id TEXT,
  p_to_id TEXT,
  p_transfers JSONB,   -- [{variable, amount}, ...]
  p_from_name TEXT DEFAULT NULL,
  p_to_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_tpl_vars JSONB;
  v_before JSONB;
  v_transfer JSONB;
  v_var TEXT;
  v_amount NUMERIC;
  v_from_val NUMERIC;
  v_to_val NUMERIC;
  v_display_from TEXT;
  v_display_to TEXT;
  v_details TEXT := '';
  v_label TEXT;
  v_msg TEXT;
BEGIN
  -- 1. 行ロック取得
  SELECT current_state, template
  INTO v_state, v_template
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  v_tpl_vars := COALESCE(v_template->'variables', '[]'::jsonb);

  -- 2. 操作前スナップショット
  v_before := public._build_snapshot(v_state);

  -- 3. transfers を順に処理
  FOR v_transfer IN SELECT * FROM jsonb_array_elements(p_transfers)
  LOOP
    v_var := v_transfer->>'variable';
    v_amount := (v_transfer->>'amount')::numeric;

    IF p_from_id = '__pot__' THEN
      -- Pot → プレイヤー
      IF COALESCE((v_state->'__pot__'->>v_var)::numeric, 0) < v_amount THEN
        RETURN jsonb_build_object('error', '供託金が不足しています');
      END IF;
      v_state := jsonb_set(v_state, ARRAY['__pot__', v_var],
        to_jsonb(COALESCE((v_state->'__pot__'->>v_var)::numeric, 0) - v_amount));
      IF NOT v_state ? p_to_id THEN
        RETURN jsonb_build_object('error', '送信先プレイヤーが見つかりません');
      END IF;
      v_state := jsonb_set(v_state, ARRAY[p_to_id, v_var],
        to_jsonb(COALESCE((v_state->p_to_id->>v_var)::numeric, 0) + v_amount));

    ELSIF p_to_id = '__pot__' THEN
      -- プレイヤー → Pot
      IF NOT v_state ? p_from_id THEN
        RETURN jsonb_build_object('error', '送信元プレイヤーが見つかりません');
      END IF;
      v_from_val := COALESCE((v_state->p_from_id->>v_var)::numeric, 0);
      v_state := jsonb_set(v_state, ARRAY[p_from_id, v_var], to_jsonb(v_from_val - v_amount));
      -- __pot__ が存在しなければ初期化
      IF NOT v_state ? '__pot__' THEN
        v_state := jsonb_set(v_state, '{__pot__}', '{}'::jsonb);
      END IF;
      v_state := jsonb_set(v_state, ARRAY['__pot__', v_var],
        to_jsonb(COALESCE((v_state->'__pot__'->>v_var)::numeric, 0) + v_amount));

    ELSE
      -- プレイヤー間
      IF NOT v_state ? p_from_id OR NOT v_state ? p_to_id THEN
        RETURN jsonb_build_object('error', 'プレイヤーが見つかりません');
      END IF;
      v_from_val := COALESCE((v_state->p_from_id->>v_var)::numeric, 0);
      v_state := jsonb_set(v_state, ARRAY[p_from_id, v_var], to_jsonb(v_from_val - v_amount));
      v_state := jsonb_set(v_state, ARRAY[p_to_id, v_var],
        to_jsonb(COALESCE((v_state->p_to_id->>v_var)::numeric, 0) + v_amount));
    END IF;

    -- ラベル取得
    v_label := public._get_variable_label(v_tpl_vars, v_var);
    IF v_details != '' THEN v_details := v_details || ', '; END IF;
    v_details := v_details || v_label || ' ' || v_amount::text;
  END LOOP;

  -- 4. 履歴メッセージ
  v_display_from := COALESCE(p_from_name,
    CASE WHEN p_from_id = '__pot__' THEN '供託回収' ELSE left(p_from_id, 8) END);
  v_display_to := COALESCE(p_to_name,
    CASE WHEN p_to_id = '__pot__' THEN '供託' ELSE left(p_to_id, 8) END);
  v_msg := v_display_from || ' → ' || v_display_to || ': ' || v_details;

  -- 5. __recent_log__ 更新
  v_state := public._push_recent_log(v_state, v_msg);

  -- 6. UPDATE rooms
  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;

  -- 7. INSERT room_history
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_force_edit_score: 指定変数の上書き
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_force_edit_score(
  p_room_id UUID,
  p_player_id TEXT,
  p_updates JSONB,      -- {"score": 30000, ...}
  p_display_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_tpl_vars JSONB;
  v_before JSONB;
  v_key TEXT;
  v_val NUMERIC;
  v_label TEXT;
  v_details TEXT := '';
  v_msg TEXT;
  v_name TEXT;
BEGIN
  SELECT current_state, template
  INTO v_state, v_template
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  IF NOT v_state ? p_player_id THEN
    RETURN jsonb_build_object('error', 'プレイヤーが見つかりません');
  END IF;

  v_tpl_vars := COALESCE(v_template->'variables', '[]'::jsonb);
  v_before := public._build_snapshot(v_state);

  -- 値を上書き
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_updates)
  LOOP
    v_state := jsonb_set(v_state, ARRAY[p_player_id, v_key], to_jsonb(v_val::numeric));
    v_label := public._get_variable_label(v_tpl_vars, v_key);
    IF v_details != '' THEN v_details := v_details || ', '; END IF;
    v_details := v_details || v_label || ': ' || v_val;
  END LOOP;

  v_name := COALESCE(p_display_name, left(p_player_id, 8));
  v_msg := '強制編集: ' || v_name || ' - ' || v_details;

  v_state := public._push_recent_log(v_state, v_msg);

  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_reset_scores: 全プレイヤーの変数を初期値にリセット
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_reset_scores(
  p_room_id UUID,
  p_variable_keys JSONB   -- ["score", "riichi"]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_tpl_vars JSONB;
  v_before JSONB;
  v_var_key TEXT;
  v_initial NUMERIC;
  v_player_id TEXT;
  v_labels TEXT := '';
  v_label TEXT;
  v_msg TEXT;
  v_var JSONB;
BEGIN
  SELECT current_state, template
  INTO v_state, v_template
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  v_tpl_vars := COALESCE(v_template->'variables', '[]'::jsonb);
  v_before := public._build_snapshot(v_state);

  -- 各変数キーについて処理
  FOR v_var_key IN SELECT * FROM jsonb_array_elements_text(p_variable_keys)
  LOOP
    -- テンプレートから初期値を取得
    v_initial := NULL;
    FOR v_var IN SELECT * FROM jsonb_array_elements(v_tpl_vars)
    LOOP
      IF v_var->>'key' = v_var_key THEN
        v_initial := (v_var->>'initial')::numeric;
        EXIT;
      END IF;
    END LOOP;

    IF v_initial IS NULL THEN CONTINUE; END IF;

    -- 全プレイヤーをリセット
    FOR v_player_id IN SELECT jsonb_object_keys(v_state)
    LOOP
      IF v_player_id NOT LIKE '__%__' THEN
        IF v_state->v_player_id ? v_var_key THEN
          v_state := jsonb_set(v_state, ARRAY[v_player_id, v_var_key], to_jsonb(v_initial));
        END IF;
      END IF;
    END LOOP;

    -- Pot リセット
    IF v_state ? '__pot__' AND v_state->'__pot__' ? v_var_key THEN
      v_state := jsonb_set(v_state, ARRAY['__pot__', v_var_key], to_jsonb(0));
    END IF;

    -- ラベル収集
    v_label := public._get_variable_label(v_tpl_vars, v_var_key);
    IF v_labels != '' THEN v_labels := v_labels || ', '; END IF;
    v_labels := v_labels || v_label;
  END LOOP;

  v_msg := 'リセット: ' || v_labels;
  v_state := public._push_recent_log(v_state, v_msg);

  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_undo_last: 最新履歴エントリのsnapshotを復元、エントリ削除
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_undo_last(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_seats JSONB;
  v_entry RECORD;
  v_restored JSONB;
  v_recent_log JSONB;
BEGIN
  SELECT current_state, template, seats
  INTO v_state, v_template, v_seats
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  -- 最新エントリ取得
  SELECT * INTO v_entry
  FROM public.room_history
  WHERE room_id = p_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '取り消せる操作がありません');
  END IF;

  -- snapshot を復元（着席プレイヤー・離席者の補完）
  v_restored := public._ensure_seated_players(
    v_entry.snapshot,
    COALESCE(v_seats, '[]'::jsonb),
    COALESCE(v_template->'variables', '[]'::jsonb),
    v_state
  );

  -- エントリ削除
  DELETE FROM public.room_history WHERE id = v_entry.id;

  -- __recent_log__: undo した操作メッセージを除去
  v_recent_log := COALESCE(v_state->'__recent_log__', '[]'::jsonb);
  v_recent_log := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(v_recent_log) AS elem
    WHERE elem->>'message' != v_entry.message
  );
  v_restored := jsonb_set(v_restored, '{__recent_log__}', v_recent_log);

  UPDATE public.rooms SET current_state = v_restored WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_rollback_to: 指定エントリ以降を全削除、snapshotを復元
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rollback_to(
  p_room_id UUID,
  p_history_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_seats JSONB;
  v_entry RECORD;
  v_restored JSONB;
  v_before JSONB;
  v_msg TEXT;
BEGIN
  SELECT current_state, template, seats
  INTO v_state, v_template, v_seats
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  -- 対象エントリ取得
  SELECT * INTO v_entry
  FROM public.room_history
  WHERE id = p_history_id AND room_id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '指定された履歴が見つかりません');
  END IF;

  v_before := public._build_snapshot(v_state);

  -- snapshot を復元
  v_restored := public._ensure_seated_players(
    v_entry.snapshot,
    COALESCE(v_seats, '[]'::jsonb),
    COALESCE(v_template->'variables', '[]'::jsonb),
    v_state
  );

  v_msg := 'ロールバック (' || to_char(v_entry.created_at AT TIME ZONE 'Asia/Tokyo', 'HH24:MI:SS') || ')';

  -- 対象エントリ以降の履歴を削除
  DELETE FROM public.room_history
  WHERE room_id = p_room_id AND created_at >= v_entry.created_at;

  -- ロールバック操作自体を履歴に追加
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  -- __recent_log__ 更新
  v_restored := public._push_recent_log(v_restored, v_msg);

  UPDATE public.rooms SET current_state = v_restored WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_save_settlement: 精算保存 + スコアリセット
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_save_settlement(
  p_room_id UUID,
  p_settlement_id UUID,
  p_player_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_tpl_vars JSONB;
  v_before JSONB;
  v_score_initial NUMERIC;
  v_player_id TEXT;
  v_var JSONB;
  v_msg TEXT;
  v_summary TEXT := '';
  v_pr JSONB;
  v_uid TEXT;
BEGIN
  SELECT current_state, template
  INTO v_state, v_template
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  v_tpl_vars := COALESCE(v_template->'variables', '[]'::jsonb);
  v_before := public._build_snapshot(v_state);

  -- score変数の初期値を取得
  v_score_initial := NULL;
  FOR v_var IN SELECT * FROM jsonb_array_elements(v_tpl_vars)
  LOOP
    IF v_var->>'key' = 'score' THEN
      v_score_initial := (v_var->>'initial')::numeric;
      EXIT;
    END IF;
  END LOOP;

  -- score をリセット
  IF v_score_initial IS NOT NULL THEN
    FOR v_player_id IN SELECT jsonb_object_keys(v_state)
    LOOP
      IF v_player_id NOT LIKE '__%__' THEN
        IF v_state->v_player_id ? 'score' THEN
          v_state := jsonb_set(v_state, ARRAY[v_player_id, 'score'], to_jsonb(v_score_initial));
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Pot の score もリセット
  IF v_state ? '__pot__' AND v_state->'__pot__' ? 'score' THEN
    v_state := jsonb_set(v_state, ARRAY['__pot__', 'score'], to_jsonb(0));
  END IF;

  -- 精算サマリメッセージ作成（rankでソート）
  FOR v_uid, v_pr IN SELECT * FROM jsonb_each(p_player_results) ORDER BY (value->>'rank')::int ASC
  LOOP
    IF v_summary != '' THEN v_summary := v_summary || ', '; END IF;
    v_summary := v_summary || (v_pr->>'displayName') || ': ';
    IF (v_pr->>'result')::numeric >= 0 THEN
      v_summary := v_summary || '+';
    END IF;
    v_summary := v_summary || (v_pr->>'result')::text;
  END LOOP;
  v_msg := '精算: ' || v_summary;

  v_state := public._push_recent_log(v_state, v_msg);

  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;

  -- settlement レコード
  INSERT INTO public.room_settlements (id, room_id, type, player_results)
  VALUES (p_settlement_id, p_room_id, 'settlement', p_player_results);

  -- 履歴レコード
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------
-- rpc_save_adjustment: 調整行保存（スコア変更なし）
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_save_adjustment(
  p_room_id UUID,
  p_settlement_id UUID,
  p_player_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state JSONB;
  v_before JSONB;
  v_msg TEXT;
  v_summary TEXT := '';
  v_pr JSONB;
  v_uid TEXT;
  v_result NUMERIC;
BEGIN
  SELECT current_state
  INTO v_state
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  v_before := public._build_snapshot(v_state);

  -- 調整サマリメッセージ（result != 0 のみ）
  FOR v_uid, v_pr IN SELECT * FROM jsonb_each(p_player_results)
  LOOP
    v_result := (v_pr->>'result')::numeric;
    IF v_result != 0 THEN
      IF v_summary != '' THEN v_summary := v_summary || ', '; END IF;
      v_summary := v_summary || (v_pr->>'displayName') || ': ';
      IF v_result >= 0 THEN
        v_summary := v_summary || '+';
      END IF;
      v_summary := v_summary || round(v_result, 1)::text;
    END IF;
  END LOOP;
  v_msg := '調整: ' || v_summary;

  v_state := public._push_recent_log(v_state, v_msg);

  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;

  INSERT INTO public.room_settlements (id, room_id, type, player_results)
  VALUES (p_settlement_id, p_room_id, 'adjustment', p_player_results);

  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_msg, v_before);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- GRANT: authenticated ロールに実行権限を付与
-- ============================================
GRANT EXECUTE ON FUNCTION public.rpc_transfer_score(UUID, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_force_edit_score(UUID, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reset_scores(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_undo_last(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rollback_to(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_settlement(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_adjustment(UUID, UUID, JSONB) TO authenticated;
