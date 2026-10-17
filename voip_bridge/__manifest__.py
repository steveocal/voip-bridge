{
    "name": "VoIP Bridge Call Log",
    "version": "18.0.1.0.0",
    "category": "Productivity/VoIP",
    "summary": "Asterisk calls from voip-bridge in voip.call: recording, transcript, notes",
    "description": """
The voip-bridge Cloudflare worker pushes every call Asterisk handles into
voip.call. This module adds the fields it fills (Asterisk call id, our DID,
voicemail flag, notes, transcript, recording) plus list/form views with an
inline audio player for the recording.
""",
    "author": "Stephen O'Cal",
    "depends": ["voip", "contacts"],
    "data": [
        "views/voip_call_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "voip_bridge/static/src/fields/*",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
