# Conference calls (Asterisk ConfBridge)

During a call in the dashboard or Android app:

1. **➕ Add**: pick an extension or type a number. The caller waits on hold
   music while you talk to the new person.
2. **👥 Merge**: everyone joins one call. **✕ Back** drops the new person and
   returns you to the caller.
3. To add more people, press **➕ Add** again. While you talk to the new person
   the others keep talking to each other, but they can't hear you. **👥 Merge**
   brings that person in too.
4. When you (the host) hang up, the call ends for everyone.

## How it works

Each extension has its own room, **8 + the extension** (8201 for 201).
**👥 Merge** does three things:

1. It sends a SIP REFER (a blind transfer) of the caller to the room.
2. It sends a REFER of the new person to the room.
3. The softphone then dials the room itself.

Asterisk hangs up the softphone's two old call legs once the transfers go
through. The call keeps the original call ID, so the history row, the notes and
the duration all carry on.

Whoever dials in from the room's own PJSIP endpoint (`CHANNEL(endpoint)` equal
to the room number without the 8) joins with the `vb_host` profile, which is
marked. Everyone else joins as `vb_guest`, which has `end_marked=yes`: when the
host leaves, the guests are dropped. A guest who is alone in the room hears
hold music.

After the merge, **Hold** only mutes your mic in the room. Transfer, Park and
📱 Mobile are hidden while you're in a conference.

## Setup

`scripts/vps-setup-conference.sh` makes these changes:

- It writes `/opt/asterisk/config/confbridge.conf`, with a bridge profile
  limited to 10 people and the two user profiles.
- It inserts `_82XX` into `[from-internal]` just before the outbound patterns,
  after backing up extensions.conf.
- It loads `app_confbridge.so` and reloads the dialplan.

Running the script again makes no changes.

## Limits

- **voip.ms:** each external person is one voip.ms channel. New accounts are
  limited by default to 5 outgoing calls at once. Two calls to the same number
  at once are also limited (cell phone forwarding is capped at 2). Inbound
  calls on international DIDs (the UK numbers) are limited to 2 at once per DID.
  voip.ms support can raise these limits for free. Extensions such as 202 use
  no voip.ms channel.
- **Recording:** recordings cover the whole conference. Inbound calls are
  recorded on the caller's leg. Outbound calls are recorded on the far end's
  leg (`scripts/vps-record-far-end.sh`), not on your own leg, which hangs up
  at the merge. The extra person's leg gets its own recording, which isn't
  linked to the call in history.
- **Odoo phone panel:** it doesn't have ➕ Add / 👥 Merge yet.
