import unittest
from alert_rules import match_kind, reconcile_target, rearm, event_is_current


class AlertRulesTests(unittest.TestCase):
    def test_target_boundary_and_gap(self):
        self.assertEqual(match_kind(10, 10), 'target')
        self.assertEqual(match_kind(8, 10), 'target')
        self.assertEqual(match_kind('10.000001', 10), 'near')

    def test_near_boundary(self):
        self.assertEqual(match_kind('10.50', 10), 'near')
        self.assertIsNone(match_kind('10.500001', 10))

    def test_invalid_prices(self):
        for value in [None, True, 0, -1, 'NaN', 'Infinity', 'oops']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                match_kind(value, 10)

    def test_revision_and_cursor(self):
        original = {'last': 'cursor', 'armed': {'near': False, 'target': False}}
        first = reconcile_target(original, 10)
        self.assertEqual(first['last'], 'cursor')
        self.assertEqual(first['target_revision'], 1)
        self.assertTrue(first['armed']['target'])
        self.assertFalse(original['armed']['target'])
        same = reconcile_target(first, '10.00')
        self.assertEqual(same['target_revision'], 1)
        for target in [9, 11]:
            self.assertEqual(reconcile_target(first, target)['target_revision'], 2)

    def test_rearm_strict_boundaries(self):
        off = {'near': False, 'target': False}
        self.assertEqual(rearm(off, '10.20', 10), off)
        self.assertEqual(rearm(off, '10.70', 10), {'near': False, 'target': True})
        self.assertEqual(rearm(off, '10.700001', 10), {'near': True, 'target': True})
        self.assertEqual(off, {'near': False, 'target': False})

    def test_current_event_and_removal(self):
        states = {'ABC': reconcile_target({}, 10)}
        event = {'symbol': 'ABC', 'target': 10, 'target_revision': 1}
        self.assertTrue(event_is_current(event, {'ABC': 10}, states))
        self.assertFalse(event_is_current(event, {}, states))
        self.assertFalse(event_is_current(event, {'ABC': 11}, states))

    def test_change_back_does_not_revive_old_event(self):
        state = reconcile_target({}, 10)
        event = {'symbol': 'ABC', 'target': 10, 'target_revision': 1}
        state = reconcile_target(reconcile_target(state, 11), 10)
        self.assertFalse(event_is_current(event, {'ABC': 10}, {'ABC': state}))

    def test_unversioned_and_malformed_events_fail_closed(self):
        states = {'ABC': reconcile_target({}, 10)}
        for event in [
            {'symbol': 'ABC', 'target': 10},
            {'symbol': 'ABC', 'target': 10, 'target_revision': True},
            {'symbol': 'ABC', 'target': 'NaN', 'target_revision': 1},
        ]:
            self.assertFalse(event_is_current(event, {'ABC': 10}, states))


if __name__ == '__main__':
    unittest.main()
