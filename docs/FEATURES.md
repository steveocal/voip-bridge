# voip-bridge: features

What the phone system does today (main branch, November 2026). It has four parts:

- **The app**: the web dashboard (also installable as a PWA) and the Android app (Capacitor), version 1.8.
- **The worker**: a Cloudflare Worker that sits between Asterisk, Odoo, Gmail and Google, and the app.
- **The PBX**: Asterisk on the VPS, set up from Odoo.
- **The Odoo addons**: `phone_bridge`, `voip_bridge` and `staff_location`.

## Calling (softphone)

- WebRTC softphone in the browser and the Android app (sip.js). Several SIP accounts per device: user, password, proxy, transport.
- Registers automatically, reconnects by itself, and rings reliably on background tabs. Desktop notifications for incoming calls.
- **Incoming calls**: ringtone with vibration as a fallback, then Answer or Decline. Decline sends SIP 603. A call that arrives while you're already on one is sent to voicemail (busy).
- **Caller names**: shown on incoming calls and on the Android incoming-call notification, matched from Odoo contacts.
- **Outgoing calls**: early media and a local ringing tone. Hanging up while it still rings cancels the call.
- **Dial screen**: one dial box with T9 contact search. Hold backspace to clear. The box clears after a call.
- **Caller ID**: ext 201 shows 01283 246491; the other extensions show the voip.ms mobile number.
- **In-call bottom bar**: Hold/Resume, Mute, a red hang-up button, Speaker and Menu.
- **In-call menu**: DTMF keypad, quick texts, and blind or attended transfer, including 📱 transfer to your mobile.
- **Call parking**: park a call, with a strip showing parked calls. The dialplan picks the slot (PARKSLOT).
- **Conference calls**: ➕ Add a person, then 👥 Merge.
- **Call via my mobile**: the PBX rings your mobile, then connects it to the other person (`/mobile-call`).
- **SIM calling** (Android): phone contacts are called from the SIM and everyone else over VoIP. SIM call durations come from the phone's call log.
- **Click-to-call** from Odoo and other pages (`/click2call`).

## Android app

- Firebase push wakes the app for incoming calls; the PBX gives it 30 s to wake. It registers at boot as well as after SIP starts.
- Incoming VoIP calls use the phone's own ringtone. Tapping the incoming-call notification answers the call.
- Speaker button, an install page, and an update prompt (voip.ihpltd.co.uk).
- The app's phone rings in parallel with the others rather than holding them up while it wakes.
- Push status in Settings says what's missing if push setup fails.

## History

- History and the dial pad share one screen. Each call is one row, with duplicate call legs merged. Day headers stay at the top while you scroll.
- **Each row shows**: direction triangles (coloured, missed calls marked), the time, the name or number, 📱 for SIM calls, 📼 for voicemail, ＋ voice note, 📝 notes, 💬 transcript and ▶ play recording.
- Search the history. Picking a contact or call narrows the list to that person.
- 💬 searches call transcripts, newest first. A match opens the call at that line.
- Swipe a row to archive or delete it.
- Calls are named from contacts. Contacts can be created automatically, or in bulk for numbers that have no name.
- Ext 202's calls are kept out of the shared history. Users only see their own calls, plus unanswered ones.

## Call details, notes and jot

- **Call details**: tabs for Notes, Transcript (with a player), Sales/Quotations, Call History and Jot.
- **Call notes**: rich text (TinyMCE), autosaved to the call and copied to Odoo.
- **Voice notes**: ＋ on the hang-up button hangs up and starts recording a note; ＋ on a History row (or a contact's calls) adds one to an old call.
  - Whisper writes it down. You check the text, and it's added to the Notes with the time and your name.
  - A spoken follow-up ("follow up in 3 days"), or a chip (Tomorrow / 3 days / 1 week / a date), becomes an Odoo To-Do on the contact, or on the call when there's no contact.
- **Jot**: a handwriting pad (perfect-freehand) on an infinite canvas with zoom and pan.
  - Write mode splits handwriting into words using pause and gap, laid out level and wrapped.
  - A tap becomes a full stop. L-shaped strokes act as Backspace and Return.
  - Workers AI reads the handwriting into text, which goes into the call's Notes as a "From Jot" block. Aa shows the text, which you can edit, and the edits autosave.
  - Return starts a new box, read in the background.
  - When writing reaches the right-hand 15% of the screen, the line is read after 0.8 s instead of the usual pauses.
  - Draw mode for free sketches; Erase; Undo.
  - Every jot setting is adjustable in the parameter table.

## Recordings, transcripts and AI

- Calls are recorded by Asterisk, with each side in its own file. You can play them in History and in call details.
- Transcription uses Workers AI Whisper, with each side labelled as a speaker. Thai is translated into English.
- AI summaries of calls are added to the notes (`/summarize`).
- Recordings are streamed from Asterisk to Odoo.

## Voicemail

- Record or upload greetings in the dashboard, name them, and pick one. They're synced to Asterisk.
- Voicemail for internal calls, with up to 25 s of ringing first. Voicemail messages appear in History with 📼.

## Meetings

- Meeting recorder: dial *91 to record a new meeting, or *92 to add to the last one. A meeting bar shows pause, stop and saving.
- Meetings are saved with their audio and blocks (`/meetings`).

## Contacts

- Contacts come from Odoo, synced to D1, with live type-ahead search. Google contacts and phone contacts are included too, with source filters.
- **Contact view**: tabs for Details, Sales, Messages and Calls. Cached details show first; the address and totals load afterwards. You can rename a contact, and it autosaves to Odoo.
- 📞 calls the contact straight away. Favourites.
- Quotation item summaries under Sales.

## Emails

- The Emails tab shows the selected contact's or call's emails, from Odoo messages and Gmail. With nothing selected, it shows recent Gmail.
- Read HTML emails, reply, and compose using Gmail.
- Connect Google in Settings, for Gmail, contacts and Calendar.

## Activities

- Every Odoo activity type, plus Google Calendar appointments, grouped by day.

## Routing and the PBX, set up from Odoo

- **Extensions**: defined in Odoo and written to Asterisk by `pbx-sync.sh`. It runs every minute, and the worker can trigger it as well. Changes reach the PBX within about two minutes. Hand-made extensions are left alone.
- **Inbound routing per number**: ring time, recording on or off, and which extensions or mobiles ring. If nobody answers: voicemail, hang up, or forward.
- **Forwarding per extension**: always, busy, no answer, busy or no answer, or straight to voicemail.
- **Quick switches per user** in the top bar: 📼 sends everything straight to voicemail; 📱 rings your mobile first.
- **Opening hours** from an Odoo working schedule, including public holidays and closures. Out of hours there's a message, then voicemail, hang up, forward or a menu.
- **Phone menus (IVR)**: spoken prompts made from text in Odoo by Workers AI voices.
  - Each key can ring extensions, ring the customer's salesperson, forward, go to voicemail, go to another menu, repeat the menu, or hang up.
  - Menu settings: how long to wait for a key, how many times to repeat, and what happens when no key is pressed.
  - Callers can dial an extension directly.
  - Callers can say their choice. AI matches what they say to a key by its name or "What It's For", then tells them "Putting you through to …".
  - **Customer's salesperson**: rings the caller's salesperson, from their Odoo contact or its company, then the sales team, all at once or one at a time.
  - **While Ringing, Callers Hear**: a message plays while the phones ring, followed by a ringing tone.
- PBX status and sync state show in the dashboard.

## Odoo integration

- Calls are pushed into Odoo (`phone_bridge.call` / `voip.call`): one record per call, withheld callers included.
- Deleting calls or contacts in Odoo clears them from the worker's copy (D1).
- Each user has their own login and extensions in the worker.
- The `phone_bridge` addon holds the extensions, numbers, opening hours, menus, the phone panel and the provisioner.
- The `voip_bridge` addon holds the call history.

## Website callback widget

- A callback widget on infraredheaterpanels.co.uk, replacing Nuacom's. The visitor gives their name and number.
- **Call now** (in office hours): 201 and 202 ring. When one answers, the PBX calls the visitor from the website number.
- **Call later**, or a "call now" nobody answers: shows in History as a missed call, with the request in the notes.

## Staff location

- Staff sign in on the Android app with their Odoo employee and Attendances PIN. The app then sends a location every 15 minutes.
- The `staff_location` Odoo module turns those readings into stops, matches them to contacts and customer meetings, and shows them on a staff map.

## Dashboard and settings

- One layout for phone and desktop: a black/grey theme, outline icons, and bottom navigation (Dial, Contacts, Emails, Activities).
- Settings for SIP accounts, the connection URL, Google, push status and Dev Mode. They're saved per device and in D1.
- A parameter table for timings, list sizes and every jot setting.
- Install as a PWA.
- Before each deploy, a check confirms the dashboard's inline script parses.
