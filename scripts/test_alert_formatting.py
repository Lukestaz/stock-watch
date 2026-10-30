import unittest
from alert_formatting import format_alert, amount, money, APP_URL


class FormattingTests(unittest.TestCase):
    def event(self, **changes):
        return {**{'symbol':'LUNR','kind':'target','target':10.5,'low':10.45,'time':'2026-10-30T12:00:00+13:00'}, **changes}

    def test_target_outputs_share_values_and_time(self):
        result = format_alert(self.event())
        self.assertIn('target reached', result['subject'])
        for key in ('text', 'html', 'whatsapp'):
            for value in ('$10.45', '$10.50', '29 Oct 2026 23:00:00 UTC', APP_URL):
                self.assertIn(value, result[key])
            self.assertIn('not a live or executable quote', result[key])
        self.assertNotIn('Current price', result['text'])
        self.assertIn(chr(10), result['text'])
        self.assertIn(chr(10), result['whatsapp'])

    def test_near_is_not_reported_as_reached(self):
        result = format_alert(self.event(kind='near', low=10.8))
        for value in result.values():
            self.assertIn('near target', value)
            self.assertNotIn('target reached', value)

    def test_no_event_text_or_link_injection(self):
        for symbol in ['LUNR\r\nBcc: other@example.invalid', '<script>', 'ABC"', 'lUnR']:
            with self.subTest(symbol=symbol), self.assertRaises(ValueError):
                format_alert(self.event(symbol=symbol))
        result = format_alert(self.event(url='javascript:alert(1)', name='<script>'))
        self.assertNotIn('<script>', result['html'])
        self.assertNotIn('javascript:', result['html'])

    def test_invalid_numbers_and_precision(self):
        for value in [True, None, 0, -1, 'NaN', 'Infinity', '1e100', '0.000000001']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                format_alert(self.event(target=value))

    def test_subcent_values_are_not_rounded_to_zero(self):
        self.assertEqual(money(amount('0.000001')), '$0.000001')
        self.assertEqual(money(amount('10.50')), '$10.50')
        self.assertEqual(money(amount('1234')), '$1,234.00')

    def test_kind_must_match_observation(self):
        for changes in [{'kind':'unknown'}, {'low':11}, {'kind':'near','low':10}, {'kind':'near','low':12}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                format_alert(self.event(**changes))

    def test_time_requires_valid_explicit_timezone(self):
        for stamp in ['2026-10-30T12:00:00', 'bad', None]:
            with self.subTest(stamp=stamp), self.assertRaises((ValueError, TypeError)):
                format_alert(self.event(time=stamp))
        self.assertIn('30 Oct 2026 12:00:00 UTC', format_alert(self.event(time='2026-10-30T12:00:00Z'))['text'])


if __name__ == '__main__':
    unittest.main()
