# Call parking (Asterisk)

The softphones' **Park** button (dashboard, Android app, Odoo panel) does a
blind transfer (SIP REFER) of the caller to **700**. Tapping a call in the
**Parked** list dials its slot (**701–719**) to pick it up.

Asterisk 22's res_parking doesn't expose which slot a call landed in, so the
dialplan picks the slot itself: the first one whose `park:` device state isn't
in use. It keeps that slot in the channel's `PARKSLOT` variable and parks the
call there with `PARKINGEXTEN`. The worker's `GET /parked` lists the channels
sitting in `Park()` over ARI and reads `PARKSLOT` from each.

A parked call that nobody picks up within 3 minutes rings the phone that
parked it again (`comebacktoorigin`).

## Setup

`scripts/vps-setup-parking.sh` applies the following. It backs up
extensions.conf first and makes no change if the 700 block is already there.

`/opt/asterisk/config/res_parking.conf`:

```ini
[general]

[default]
parkpos => 701-719
context => parkedcalls
findslot => first
parkingtime => 180
comebacktoorigin => yes
parkedmusicclass => default
```

In `[from-internal]` of `extensions.conf`, before the outbound patterns.
Explicit extensions and the narrower `_7[01]X` win over `_X.`, so 700–719
never go out as phone numbers:

```
exten => 700,1,NoOp(PARK: ${CALLERID(num)})
same => n,Set(i=701)
same => n(next),GotoIf($["${DEVICE_STATE(park:${i}@parkedcalls)}" != "INUSE"]?found)
same => n,Set(i=$[${i} + 1])
same => n,GotoIf($[${i} <= 719]?next)
same => n,Park(default,s)
same => n,Hangup()
same => n(found),Set(PARKSLOT=${i})
same => n,Set(PARKINGEXTEN=${i})
same => n,Park(default,s)
same => n,Hangup()
exten => _7[01]X,1,NoOp(UNPARK: ${CALLERID(num)} <- ${EXTEN})
same => n,ParkedCall(default,${EXTEN})
same => n,Hangup()
```

`Park(…,s)` skips announcing the slot number to the caller being parked, who
hears hold music instead.
