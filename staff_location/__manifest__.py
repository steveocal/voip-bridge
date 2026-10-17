{
    "name": "Staff Locations & Customer Visits",
    "version": "18.0.1.0.1",
    "category": "Human Resources",
    "summary": "Staff phone locations as stops, matched to contacts; customer meetings report and map",
    "description": """
The voip-bridge phone app sends a signed-in employee's location every 15
minutes (via the voip-bridge worker, which calls staff.location.stay.record_fix).
Readings within 20 m extend the current stop; a stop near a contact for long
enough becomes a customer meeting, logged as a calendar event and a note on
the contact. Contacts are geocoded (street or postcode, never just the city)
when they call, or in bulk from the contact list.
""",
    "author": "Stephen O'Cal",
    "depends": ["hr", "calendar", "mail", "base_geolocalize", "web_map", "voip"],
    "data": [
        "security/ir.model.access.csv",
        "data/config.xml",
        "views/staff_location_views.xml",
        "views/res_partner_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "staff_location/static/src/map/*",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
