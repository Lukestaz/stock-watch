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
        connection.executescript((root / 'worker/migrations/0005_simplicity.sql').read_text())
        print(json.dumps([]))
    else:
        connection.execute('BEGIN IMMEDIATE')
        results = []
        for statement in json.load(sys.stdin):
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
