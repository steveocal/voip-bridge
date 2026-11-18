# Feature ideas: selling points and gaps

Written 2026-11-17. Status: suggestions, nothing built. Based on `docs/FEATURES.md` and `docs/multi-tenant-plan.md`, not on market research. The `phone_bridge` addon was not read, so some gaps below may already be covered there.

**Recommended selling point:** the phone system that does the Odoo admin for you. voip-bridge already holds, in one place, what competitors lack: the call transcript, the customer's Odoo record, their emails and the routing. Build on that instead of on PBX features.

## Features that would set it apart

1. **Call to draft quotation.** After a call, the AI reads the transcript and drafts the Odoo quotation and the follow-up email for the user to check and send. Calls are already summarised, follow-up dates are already extracted, and the product shorthand ("2-160 1-1.8") exists. The same step should also update the contact's name, email and address from what was said, instead of leaving "17/11/26 01283…" contacts.

2. **A brief when the phone rings.** Three lines on the incoming-call screen: what the last call was about, any open quotation or unpaid invoice, and the last email. All the data is already fetched for the call details tabs; it just arrives after the call is answered instead of before.

3. **AI receptionist out of hours and when everyone is busy.** In place of voicemail, a voice agent takes the message, answers basic product questions, books a callback slot and creates the Odoo lead. The spoken menus already match speech to a choice; this is the next step, and it is the feature a small business will pay for.

4. **Routing on Odoo data.** "Ring the customer's salesperson" exists. Extend it:
   - Callers with an overdue invoice go to accounts.
   - Callers with an order in delivery go to dispatch.
   - Repeat missed callers jump the queue.
   - Unknown numbers go to the menu while known customers skip it.

5. **Ask your calls.** One search box per customer over transcripts, meetings and emails ("what did we promise them on delivery?"), answered with links to the moment in the recording. Today there is only keyword transcript search.

6. **Automatic visit reports.** Staff location already matches stops to customers, and the meeting recorder already transcribes. Join them: a stop at a customer plus a recording becomes a visit record with notes in Odoo. No other Odoo phone product is known to have both halves.

## Gaps a buyer would notice

| Gap | Why it matters |
|---|---|
| No iPhone app | The largest one for selling it. Incoming calls on iOS need a native shell with CallKit and VoIP push; a PWA can't ring reliably. |
| No call queue | Ring groups only. No hold music with position, no "all busy" handling beyond voicemail, no callback-from-queue. |
| No presence | Nobody can see who is on a call or available before transferring. |
| No text messaging | No SMS or WhatsApp to customers, and no "sorry we missed you" text after a missed call. |
| ~~Missed calls have no owner~~ | Done 2026-11-18: claim, done, take over, and auto-done when the number is called back (`src/missed.ts`). |
| No reporting | No answer rate, missed-call response time, calls per person or per number. A manager will ask for this first. |
| Recording compliance | No recording announcement, no retention period, no pause for card details. The multi-tenant plan already lists the first two as required. |
| No per-campaign numbers | A number per advert or web page, written to the Odoo lead source, shows which marketing makes the phone ring. |
| No spam blocking | No block list or caller reputation; every nuisance call also creates an Odoo contact. |
| No fallback if the PBX is down | Carrier-level failover to mobiles would keep the main number answering. |
| Desk phones are manual | No provisioning for handsets, which matters once customers aren't all on WebRTC. |

## What to build first

- **For IHP's own use:** ideas 1 and 2, plus missed-call ownership. They reuse what exists and save time on every call.
- **Before selling it:** the iPhone app, the recording announcement and retention, and basic reporting. Without those, a trial will stall whatever the AI features do.
- **As the headline when selling:** idea 3, the AI receptionist. It is the easiest to demonstrate and the hardest for Odoo's own VoIP app to match.

The security fixes in `docs/review.md` come before any of this: several of these features (the AI receptionist, text messaging, routing on invoices) widen what an attacker could reach.
