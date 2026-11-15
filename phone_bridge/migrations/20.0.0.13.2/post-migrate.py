# Odoo 20 only accepts API keys whose scope matches the request ("rpc"); keys
# made by Odoo 19 for the worker had no scope, so give them the rpc scope.


def migrate(cr, version):
    cr.execute("""
        UPDATE res_users_apikeys SET scope = 'rpc'
         WHERE scope IS NULL AND name LIKE 'Phone Bridge worker (%%'
    """)
