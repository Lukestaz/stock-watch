"""Pure legacy buy-target rules. No network, persistence or notification sends."""
from decimal import Decimal, InvalidOperation


def price(value):
    if isinstance(value, bool):
        raise ValueError('Invalid price')
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError('Invalid price') from None
    if not result.is_finite() or result <= 0:
        raise ValueError('Invalid price')
    return result


def match_kind(low, target):
    low, target = price(low), price(target)
    if low <= target:
        return 'target'
    if low <= target * Decimal('1.05'):
        return 'near'
    return None


def reconcile_target(state, target):
    """Return copied state; preserve cursor and invalidate prior target revisions.

    First adoption also increments revision: unversioned pending events must not
    silently become eligible. Call only with a validated configured target.
    """
    target = price(target)
    result = {**state, 'armed': dict(state.get('armed', {}))}
    if state.get('target_value') != str(target.normalize()):
        result['target_revision'] = int(state.get('target_revision', 0)) + 1
        result['target_value'] = str(target.normalize())
        result['armed'] = {'near': True, 'target': True}
    return result


def rearm(armed, close, target):
    close, target = price(close), price(target)
    result = dict(armed)
    if close > target * Decimal('1.07'):
        result['near'] = True
    if close > target * Decimal('1.02'):
        result['target'] = True
    return result


def event_is_current(event, targets, states):
    """Fail closed for removed symbols, old revisions and malformed prices."""
    symbol = event.get('symbol')
    if symbol not in targets or symbol not in states:
        return False
    state = states[symbol]
    revision = event.get('target_revision')
    if type(revision) is not int or revision <= 0:
        return False
    try:
        return (revision == state.get('target_revision')
                and price(event.get('target')) == price(targets[symbol])
                and price(state.get('target_value')) == price(targets[symbol]))
    except ValueError:
        return False
