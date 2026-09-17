-- Seed a test call-history row so Notes + Jot editing can be verified end to end.
INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, end_date, notes_html, jot_svg, jot_json)
VALUES (
  'test-call-jot-demo-1',
  '+447700900123',
  '',
  'incoming',
  'terminated',
  1789617304518,
  1789617429518,
  '<p>Test call history item — QA seed row for the Notes + Jot save/reopen flow.</p><p>Edit this text, then switch to the Jot tab and edit the sketch, then hit Save.</p><br><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160"><rect width="240" height="160" fill="#1e1e1e"/><polyline points="20,80 40,60 60,80 80,50 100,80 120,65 140,80" fill="none" stroke="#e9ecef" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="20" y="130" fill="#999" font-family="sans-serif" font-size="12">Jot test sketch</text></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160"><rect width="240" height="160" fill="#1e1e1e"/><polyline points="20,80 40,60 60,80 80,50 100,80 120,65 140,80" fill="none" stroke="#e9ecef" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="20" y="130" fill="#999" font-family="sans-serif" font-size="12">Jot test sketch</text></svg>',
  '{"elements":[{"id":"test-stroke-1","type":"freedraw","x":100,"y":100,"width":120,"height":40,"angle":0,"strokeColor":"#e9ecef","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"groupIds":[],"frameId":null,"roundness":null,"seed":12345,"version":1,"versionNonce":12345,"isDeleted":false,"boundElements":null,"updated":1,"link":null,"locked":false,"points":[[0,0],[20,-10],[40,0],[60,-15],[80,0],[100,-5],[120,0]],"pressures":[],"simulatePressure":true,"lastCommittedPoint":null}],"appState":{"viewBackgroundColor":"#1e1e1e"}}'
)
ON CONFLICT(call_id) DO UPDATE SET
  notes_html = excluded.notes_html,
  jot_svg = excluded.jot_svg,
  jot_json = excluded.jot_json,
  end_date = excluded.end_date,
  state = excluded.state;
