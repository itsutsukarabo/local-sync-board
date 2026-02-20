CREATE OR REPLACE FUNCTION public.rpc_update_counter(
  p_room_id UUID,
  p_expected_value INTEGER,
  p_new_value INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_room rooms%ROWTYPE;
  v_current INTEGER;
BEGIN
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  v_current := COALESCE((v_room.current_state->>'__count__')::INTEGER, 0);

  -- CAS チェック: DB の現在値が expected と異なれば競合
  IF v_current <> p_expected_value THEN
    RETURN jsonb_build_object('conflict', true, 'current_value', v_current);
  END IF;

  UPDATE rooms
  SET current_state = jsonb_set(current_state, '{__count__}', to_jsonb(p_new_value))
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_counter TO authenticated;
