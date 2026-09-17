-- Re-seed after call_log was cleared externally (bare DELETE FROM call_log, run twice — see D1 insights).
INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, end_date, notes_html, jot_svg, jot_json)
VALUES (
  'test-call-jot-demo-1',
  '+447700900123',
  '',
  'incoming',
  'terminated',
  1789622983410,
  1789623108410,
  '<p>Test call history item — QA seed row (v2, new Jot engine).</p>',
  '',
  '{"v": 1, "canvasWidth": 340, "drawStrokes": [{"id": 1, "points": [[40, 60, 0.5], [60, 40, 0.5], [80, 65, 0.5], [100, 35, 0.5], [120, 60, 0.5]]}], "words": []}'
)
ON CONFLICT(call_id) DO UPDATE SET
  notes_html = excluded.notes_html,
  jot_svg = excluded.jot_svg,
  jot_json = excluded.jot_json,
  end_date = excluded.end_date,
  state = excluded.state;
