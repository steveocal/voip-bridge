{
    "name": "Phone Bridge",
    "version": "18.0.0.4.0",
    "category": "Productivity/VoIP",
    "summary": "Phone system for Odoo: softphone, call history, recordings and transcripts, run on your own Cloudflare account",
    "description": """
Phone Bridge deploys a Cloudflare Worker into your own Cloudflare account and
connects it to your phone system (Asterisk today). The worker handles call
state, recordings, Whisper transcripts, push and the website callback
widget; Odoo holds the call history and is where you make and take calls.
""",
    "author": "Stephen O'Cal",
    "depends": ["base_setup", "mail", "contacts"],
    "external_dependencies": {"python": ["requests"]},
    "data": [
        "security/ir.model.access.csv",
        "data/mail_template.xml",
        "views/phone_bridge_call_views.xml",
        "views/res_partner_views.xml",
        "views/phone_bridge_installation_views.xml",
        "views/phone_bridge_extension_views.xml",
        "views/res_users_views.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "phone_bridge/static/src/fields/*",
            "phone_bridge/static/src/softphone/*",
        ],
    },
    "installable": True,
    "application": True,
    "license": "LGPL-3",
}
