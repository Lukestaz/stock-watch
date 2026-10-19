import sqlite3
import unittest
from pathlib import Path

SCHEMA = Path(__file__).resolve().parents[2] / 'worker/migrations/0001_accounts.sql'

class AccountSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(SCHEMA.read_text())
        self.db.executemany('INSERT INTO users(id,google_sub) VALUES (?,?)', [('u1','g1'),('u2','g2')])
        self.db.executemany('INSERT INTO watchlists(user_id) VALUES (?)', [('u1',),('u2',)])

    def add(self, symbol='LUNR', user='u1', target=10, position=0):
        self.db.execute('INSERT INTO watchlist_entries(user_id,symbol,target_usd,position) VALUES (?,?,?,?)', (user,symbol,target,position))

    def reject(self, sql, args=()):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql,args)

    def fill(self):
        for i in range(100):
            self.add(symbol='T'+str(i),position=i)

    def test_symbols(self):
        self.add()
        for symbol in ['A B','A!','-ABC','.ABC','lunr','','A'*16]:
            with self.subTest(symbol=symbol):
                self.reject('UPDATE watchlist_entries SET symbol=?', (symbol,))
                with self.assertRaises(sqlite3.IntegrityError):
                    self.add(symbol=symbol)
        for symbol in ['BRK.B','BF-B','A1']:
            self.add(symbol=symbol)

    def test_integer_fields(self):
        self.add()
        for table,fields in [('watchlist_entries',['position','target_revision']),('watchlists',['revision','monitor_applied_revision'])]:
            for field in fields:
                for value in [-1,0.5,'oops']:
                    with self.subTest(field=field,value=value):
                        self.reject(f'UPDATE {table} SET {field}=?', (value,))
        self.reject('UPDATE watchlists SET monitor_applied_revision=1')
        self.db.execute('UPDATE watchlists SET revision=2,monitor_applied_revision=2')
        self.reject('UPDATE watchlists SET revision=1')

    def test_capacity(self):
        self.fill()
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(symbol='EXTRA')
        self.add(user='u2')
        self.reject('UPDATE watchlist_entries SET user_id=? WHERE user_id=?', ('u1','u2'))
        self.assertEqual(self.db.execute('SELECT count(*) FROM watchlist_entries WHERE user_id=?', ('u1',)).fetchone()[0],100)
        self.db.execute('UPDATE watchlist_entries SET target_usd=11 WHERE user_id=?', ('u1',))
        self.db.execute('INSERT INTO watchlist_entries(user_id,symbol,target_usd,position) VALUES (?,?,?,?) ON CONFLICT(user_id,symbol) DO UPDATE SET target_usd=excluded.target_usd', ('u1','T0',12,0))
        self.db.execute('INSERT OR REPLACE INTO watchlist_entries(user_id,symbol,target_usd,position) VALUES (?,?,?,?)', ('u1','T0',13,0))
        self.db.execute('DELETE FROM watchlist_entries WHERE user_id=? AND symbol=?', ('u1','T1'))
        self.add(symbol='NEW')
        self.assertEqual(self.db.execute('SELECT count(*) FROM watchlist_entries WHERE user_id=?', ('u1',)).fetchone()[0],100)

    def test_bulk_statement_rollback(self):
        for i in range(99):
            self.add(symbol='T'+str(i))
        self.reject("INSERT INTO watchlist_entries(user_id,symbol,target_usd,position) VALUES ('u1','EXTRA1',10,99),('u1','EXTRA2',10,100)")
        self.assertEqual(self.db.execute('SELECT count(*) FROM watchlist_entries').fetchone()[0],99)

    def test_targets_and_alerts(self):
        for target in [0,-1,None,float('nan'),float('inf'),1e9+1]:
            with self.subTest(target=target):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.add(target=target)
        self.add(target=1e9)
        self.assertEqual(self.db.execute('SELECT alerts_enabled,email_enabled,whatsapp_enabled FROM watchlist_entries').fetchone(),(0,0,0))
        self.reject('UPDATE watchlist_entries SET alerts_enabled=1')
        for field in ['alerts_enabled','email_enabled','whatsapp_enabled']:
            self.reject(f'UPDATE watchlist_entries SET {field}=2')
        self.db.execute('UPDATE watchlist_entries SET alerts_enabled=1,email_enabled=1')

    def test_identity_and_cascades(self):
        self.reject('INSERT INTO users(id,google_sub) VALUES (?,?)', ('u3','g1'))
        self.reject('INSERT INTO watchlists(user_id) VALUES (?)', ('missing',))
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(user='missing')
        self.add()
        with self.assertRaises(sqlite3.IntegrityError):
            self.add()
        self.add(user='u2',target=20)
        self.db.execute('DELETE FROM users WHERE id=?', ('u1',))
        self.assertEqual(self.db.execute('SELECT user_id FROM watchlist_entries').fetchall(),[('u2',)])
        self.assertEqual(self.db.execute('SELECT user_id FROM watchlists').fetchall(),[('u2',)])
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone(),('ok',))

if __name__ == '__main__':
    unittest.main()
