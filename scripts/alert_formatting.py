"""Pure notification formatting. No sends, recipients, credentials or storage."""
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html import escape

APP_URL = 'https://stock-watch-app.lukestaz.workers.dev/'
NOTICE = 'Delayed market data, not a live or executable quote. Check your broker before acting. Not an automatic buy instruction.'


def amount(value):
    if isinstance(value, bool):
        raise ValueError('Invalid amount')
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError('Invalid amount') from None
    if not number.is_finite() or not 0 < number <= Decimal('1000000000'):
        raise ValueError('Invalid amount')
    if number.normalize().as_tuple().exponent < -8:
        raise ValueError('Amount exceeds supported precision')
    return number


def money(number):
    text = format(number, ',.8f').rstrip('0').rstrip('.')
    whole, _, fraction = text.partition('.')
    return '$' + whole + '.' + fraction.ljust(2, '0')


def format_alert(event):
    symbol, kind = event.get('symbol'), event.get('kind')
    if not isinstance(symbol, str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9.\-]{0,14}', symbol):
        raise ValueError('Invalid symbol')
    if kind not in ('target', 'near'):
        raise ValueError('Invalid alert kind')
    target, low = amount(event.get('target')), amount(event.get('low'))
    if (kind == 'target' and low > target) or (kind == 'near' and not target < low <= target * Decimal('1.05')):
        raise ValueError('Observation does not match alert kind')
    stamp = event.get('time')
    if not isinstance(stamp, str) or len(stamp) > 64:
        raise ValueError('Invalid observation time')
    observed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    if observed.utcoffset() is None:
        raise ValueError('Observation time requires timezone')
    time = observed.astimezone(timezone.utc).strftime('%d %b %Y %H:%M:%S UTC')
    label = 'target reached' if kind == 'target' else 'near target'
    title = f'{symbol} - {label}'
    subject = f'Stock Watch | {title} | {money(target)}'
    fields = [('Observed low', money(low)), ('Your target', money(target)), ('Observed at', time)]
    text = 'Stock Watch\n' + title + '\n\n' + '\n'.join(f'{key}: {value}' for key, value in fields)
    text += f'\n\nOpen Stock Watch: {APP_URL}\n\n{NOTICE}\n'
    rows = ''.join(f'<tr><th scope="row" style="padding:8px;text-align:left">{escape(key)}</th><td style="padding:8px">{escape(value)}</td></tr>' for key, value in fields)
    html = ('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta charset="utf-8"><title>Stock Watch alert</title></head>'
            '<body style="margin:0;padding:20px;background:#f3f5f8;color:#142034;font-family:Arial,sans-serif">'
            '<main style="max-width:560px;margin:auto;padding:24px;background:#ffffff;border:1px solid #d7dfeb;border-radius:12px">'
            '<p style="margin:0;color:#53647c">Stock Watch</p>'
            f'<h1 style="font-size:24px">{escape(title)}</h1><table>{rows}</table>'
            f'<p style="margin:24px 0"><a href="{APP_URL}" style="display:inline-block;padding:12px 18px;background:#176555;color:#ffffff;text-decoration:none;border-radius:6px">Open Stock Watch</a></p>'
            f'<p style="font-size:13px;line-height:1.5;color:#53647c">{escape(NOTICE)}</p></main></body></html>')
    whatsapp = f'Stock Watch | {title}\nObserved low: {money(low)}\nTarget: {money(target)}\nObserved: {time}\n{APP_URL}\n{NOTICE}'
    return {'subject': subject, 'text': text, 'html': html, 'whatsapp': whatsapp}
