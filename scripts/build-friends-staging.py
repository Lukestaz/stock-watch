import argparse
import json
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit

PRODUCTION_ORIGIN = 'https://stock-watch-app.lukestaz.workers.dev'
PRODUCTION_CLIENT = '19866673111-hg5958bvoiqoa5crrt0jmalvh1mssfvk.apps.googleusercontent.com'
PRODUCTION_DB = '4cb54afc-8f2d-4f62-8b6b-7d59f343b938'

def build(args, root=None):
    root = Path(root or Path(__file__).resolve().parents[1]).resolve()
    origin = urlsplit(args.origin)
    if (origin.scheme != 'https' or not origin.hostname or origin.username or origin.password
        or origin.port or origin.path or origin.query or origin.fragment
        or args.origin != 'https://' + origin.hostname or args.origin == PRODUCTION_ORIGIN
        or not re.fullmatch(r'[a-z0-9.-]+', origin.hostname)):
        raise ValueError('Separate exact HTTPS staging origin required')
    if str(uuid.UUID(args.database_id)) != args.database_id or args.database_id == PRODUCTION_DB:
        raise ValueError('Separate staging database UUID required')
    for value in [args.worker, args.database_name, args.prices_service]:
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', value):
            raise ValueError('Invalid resource name')
    if args.worker == 'stock-watch-app' or args.database_name == 'stock-watch' or args.prices_service == 'stock-watch-prices':
        raise ValueError('Production resources forbidden')
    if not re.fullmatch(r'[0-9]+-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com', args.client_id) or args.client_id == PRODUCTION_CLIENT:
        raise ValueError('Separate staging Google client required')
    if not re.fullmatch(r'[1-9][0-9]{0,18}', args.rate_limit_namespace) or args.rate_limit_namespace == '1986667311':
        raise ValueError('Separate reviewed rate-limit namespace required')
    destination = Path(args.output).resolve()
    if destination == root or destination.is_relative_to(root) or root.is_relative_to(destination):
        raise ValueError('Output must be outside and not contain the checkout')
    if destination.exists() or not destination.parent.is_dir():
        raise ValueError('Output must not exist and its parent must exist')
    signin = (root / 'site/account-signin.js').read_text()
    market = (root / 'site/market-data.js').read_text()
    price_origin = 'https://stock-watch-prices.lukestaz.workers.dev'
    if signin.count(PRODUCTION_ORIGIN) != 1 or signin.count(PRODUCTION_CLIENT) != 1 or price_origin not in market:
        raise ValueError('Bootstrap changed; review build substitutions')
    for directory in ['site', 'worker/src', 'worker/migrations']:
        if not (root / directory).is_dir():
            raise ValueError('Missing source directory')
    config = {
        'name': args.worker, 'main': 'src/account-runtime.mjs', 'compatibility_date': '2026-10-19',
        'workers_dev': True, 'preview_urls': False,
        'vars': {'ACCOUNTS_ENABLED': 'true', 'APP_ORIGIN': args.origin, 'GOOGLE_CLIENT_ID': args.client_id,
                 'FRIENDS_ALERTS_ENABLED': 'false', 'FRIENDS_ENROLLMENT_ENABLED': 'false', 'FRIENDS_SCHEDULE_ENABLED': 'false'},
        'd1_databases': [{'binding': 'DB', 'database_name': args.database_name,
                          'database_id': args.database_id, 'migrations_dir': './migrations'}],
        'assets': {'directory': './static', 'binding': 'ASSETS', 'run_worker_first': True},
        'services': [{'binding': 'PRICES', 'service': args.prices_service}],
        'ratelimits': [{'name': 'ACCOUNT_LIMIT', 'namespace_id': args.rate_limit_namespace,
                       'simple': {'limit': 30, 'period': 60}}],
        'triggers': {'crons': []}
    }
    with tempfile.TemporaryDirectory(prefix='.staging-build-', dir=destination.parent) as temp:
        staged = Path(temp) / 'build'
        staged.mkdir()
        for source, target in [('site', 'static'), ('worker/src', 'src'), ('worker/migrations', 'migrations')]:
            shutil.copytree(root / source, staged / target)
        (staged / 'static/account-signin.js').write_text(signin.replace(PRODUCTION_ORIGIN, args.origin).replace(PRODUCTION_CLIENT, args.client_id))
        (staged / 'static/market-data.js').write_text(market.replace(price_origin, '/api'))
        (staged / 'wrangler.jsonc').write_text(json.dumps(config, indent=2) + '\n')
        if destination.exists():
            raise ValueError('Output appeared during build; refusing overwrite')
        staged.rename(destination)
    return destination

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build only: no deployment, migrations, secrets or emails')
    for flag in ['origin', 'worker', 'database-name', 'database-id', 'client-id', 'prices-service', 'rate-limit-namespace', 'output']:
        parser.add_argument('--' + flag, required=True)
    build(parser.parse_args())
