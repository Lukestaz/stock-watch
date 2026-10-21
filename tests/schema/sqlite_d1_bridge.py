import json
import sqlite3
import sys
from pathlib import Path

connection = sqlite3.connect(sys.argv[1], isolation_level=None, timeout=10)
connection.row_factory = sqlite3.Row
connection.execute('PRAGMA foreign_keys=ON')
try:
    if sys.argv[2] == 'init':
        root = Path(__file__).resolve().parents[2]
        for migration in sorted((root / 'worker/migrations').glob('*.sql')):
            connection.executescript(migration.read_text())
        connection.executemany('INSERT INTO users(id,google_sub) VALUES (?,?)', [('u1','g1'),('u2','g2')])
        connection.executemany('INSERT INTO watchlists(user_id) VALUES (?)', [('u1',),('u2',)])
        print(json.dumps([]))
    else:
        statements = json.load(sys.stdin)
        connection.execute('BEGIN IMMEDIATE')
        results = []
        for statement in statements:
            cursor = connection.execute(statement['sql'], statement['args'])
            rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
            results.append({'success': True, 'results': rows})
        connection.execute('COMMIT')
        print(json.dumps(results))
except Exception:
    if connection.in_transaction:
        connection.execute('ROLLBACK')
    raise
finally:
    connection.close()
