import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('staging_builder', ROOT / 'scripts/build-friends-staging.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class StagingBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'repo'
        for directory in ['site', 'worker/src', 'worker/migrations']:
            (self.root / directory).mkdir(parents=True)
        self.signin = "const APP_ORIGIN='" + module.PRODUCTION_ORIGIN + "';const CLIENT_ID='" + module.PRODUCTION_CLIENT + "';"
        (self.root / 'site/account-signin.js').write_text(self.signin)
        (self.root / 'site/market-data.js').write_text("const URL='https://stock-watch-prices.lukestaz.workers.dev';")
        (self.root / 'worker/src/account-runtime.mjs').write_text('export default {};')
        (self.root / 'worker/migrations/0001.sql').write_text('SELECT 1;')
        self.args = argparse.Namespace(origin='https://staging.example.invalid', worker='fixture-staging',
            database_name='fixture-staging-db', database_id='11111111-1111-4111-8111-111111111111',
            client_id='123-fixture.apps.googleusercontent.com', prices_service='fixture-prices',
            rate_limit_namespace='123456789', output=str(self.base / 'build'))

    def test_isolated_self_contained_build(self):
        output = module.build(self.args, self.root)
        config = json.loads((output / 'wrangler.jsonc').read_text())
        self.assertEqual(config['d1_databases'][0]['migrations_dir'], './migrations')
        self.assertTrue((output / 'migrations/0001.sql').is_file())
        self.assertEqual(config['triggers']['crons'], [])
        for key in ['FRIENDS_ALERTS_ENABLED', 'FRIENDS_ENROLLMENT_ENABLED', 'FRIENDS_SCHEDULE_ENABLED']:
            self.assertEqual(config['vars'][key], 'false')
        self.assertEqual(config['ratelimits'][0]['namespace_id'], self.args.rate_limit_namespace)
        self.assertIn(self.args.origin, (output / 'static/account-signin.js').read_text())
        self.assertIn(self.args.client_id, (output / 'static/account-signin.js').read_text())
        self.assertNotIn(module.PRODUCTION_ORIGIN, (output / 'static/account-signin.js').read_text())
        self.assertIn("'/api'", (output / 'static/market-data.js').read_text())
        self.assertEqual((self.root / 'site/account-signin.js').read_text(), self.signin)

    def test_rejects_production_identifiers(self):
        for field, value in [('origin', module.PRODUCTION_ORIGIN), ('database_id', module.PRODUCTION_DB),
            ('worker', 'stock-watch-app'), ('database_name', 'stock-watch'), ('prices_service', 'stock-watch-prices'),
            ('client_id', module.PRODUCTION_CLIENT), ('rate_limit_namespace', '1986667311')]:
            with self.subTest(field=field):
                args = argparse.Namespace(**vars(self.args))
                setattr(args, field, value)
                with self.assertRaises(ValueError):
                    module.build(args, self.root)
                self.assertFalse(Path(args.output).exists())

    def test_rejects_checkout_and_ancestor_outputs(self):
        for output in [self.root, self.root / 'site/build', self.root / 'worker/build', self.base]:
            with self.subTest(output=output):
                self.args.output = str(output)
                with self.assertRaises(ValueError):
                    module.build(self.args, self.root)

    def test_resolves_symlink_before_output_validation(self):
        link = self.base / 'linked-site'
        link.symlink_to(self.root / 'site', target_is_directory=True)
        self.args.output = str(link / 'build')
        with self.assertRaises(ValueError):
            module.build(self.args, self.root)

    def test_refuses_existing_output(self):
        output = Path(self.args.output)
        output.mkdir()
        (output / 'sentinel').write_text('keep')
        with self.assertRaises(ValueError):
            module.build(self.args, self.root)
        self.assertEqual((output / 'sentinel').read_text(), 'keep')

    def test_rejects_unsafe_origins(self):
        for origin in ['http://staging.example.invalid', 'https://staging.example.invalid/',
            'https://user@staging.example.invalid', 'https://staging.example.invalid:443',
            'https://staging.example.invalid?q=x', 'https://STAGING.example.invalid']:
            with self.subTest(origin=origin):
                self.args.origin = origin
                with self.assertRaises(ValueError):
                    module.build(self.args, self.root)

    def test_bootstrap_drift_fails_before_writing(self):
        (self.root / 'site/account-signin.js').write_text('changed')
        with self.assertRaises(ValueError):
            module.build(self.args, self.root)
        self.assertFalse(Path(self.args.output).exists())

    def test_missing_source_leaves_no_partial_output(self):
        (self.root / 'worker/migrations/0001.sql').unlink()
        (self.root / 'worker/migrations').rmdir()
        with self.assertRaises(ValueError):
            module.build(self.args, self.root)
        self.assertFalse(Path(self.args.output).exists())

if __name__ == '__main__':
    unittest.main()
