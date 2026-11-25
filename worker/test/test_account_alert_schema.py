"""Local SQLite checks only: no D1 access, network, users or sends."""
import sqlite3,unittest
from pathlib import Path

MIGRATIONS=Path(__file__).resolve().parents[1]/'migrations'

class AccountAlertSchemaTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.addCleanup(self.db.close)
  self.db.execute('PRAGMA foreign_keys=ON')
  self.db.executescript((MIGRATIONS/'0001_accounts.sql').read_text())
  self.db.executescript((MIGRATIONS/'0005_account_alerts.sql').read_text())
  for user,target in [('alice',10),('bob',9)]:
   self.db.execute('INSERT INTO users(id,google_sub) VALUES (?,?)',(user,'sub-'+user))
   self.db.execute('INSERT INTO watchlists(user_id) VALUES (?)',(user,))
   self.db.execute("INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision) VALUES (?,'ABC',?,0,1)",(user,target))

 def destination(self,user='alice',channel='email'):
  self.db.execute('INSERT INTO alert_destinations(user_id,channel,address,provider) VALUES (?,?,?,?)',(user,channel,user+'@example.invalid','shared-smtp' if channel=='email' else 'unconfigured'))

 def event(self,user='alice',revision=1):
  self.db.execute("INSERT INTO account_alert_events(user_id,symbol,target_revision,kind,observed_at,target_usd,low_usd) VALUES (?,'ABC',?,'target',1000,?,9)",(user,revision,10 if user=='alice' else 9))

 def delivery(self,user='alice',channel='email'):
  self.db.execute("INSERT INTO account_alert_deliveries(user_id,symbol,target_revision,kind,observed_at,channel,destination_revision) VALUES (?,'ABC',1,'target',1000,?,1)",(user,channel))

 def test_defaults_never_enrol_existing_users(self):
  self.assertEqual(self.db.execute('SELECT count(*) FROM alert_destinations').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT sum(alerts_enabled+email_enabled+whatsapp_enabled) FROM watchlist_entries').fetchone()[0],0)
  self.destination()
  self.assertEqual(self.db.execute('SELECT enabled,verified_at,revision FROM alert_destinations').fetchone(),(0,None,1))

 def test_unverified_destination_cannot_be_enabled(self):
  self.destination()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE alert_destinations SET enabled=1')

 def test_destination_change_revokes_verification_and_consent(self):
  self.destination()
  self.db.execute('UPDATE alert_destinations SET verified_at=1000,enabled=1')
  self.db.execute("UPDATE alert_destinations SET address='new@example.invalid'")
  self.assertEqual(self.db.execute('SELECT enabled,verified_at,revision FROM alert_destinations').fetchone(),(0,None,2))
  self.db.execute('UPDATE alert_destinations SET verified_at=1001,enabled=1')
  self.db.execute("UPDATE alert_destinations SET provider='replacement-smtp'")
  self.assertEqual(self.db.execute('SELECT enabled,verified_at,revision FROM alert_destinations').fetchone(),(0,None,3))

 def test_two_users_do_not_share_delivery_state(self):
  for user in ('alice','bob'):self.destination(user);self.event(user);self.delivery(user)
  self.db.execute("UPDATE account_alert_deliveries SET status='accepted',attempts=1 WHERE user_id='alice'")
  self.assertEqual(self.db.execute('SELECT user_id,status,attempts FROM account_alert_deliveries ORDER BY user_id').fetchall(),[('alice','accepted',1),('bob','pending',0)])

 def test_other_users_destination_cannot_satisfy_foreign_key(self):
  self.destination('alice');self.event('bob')
  with self.assertRaises(sqlite3.IntegrityError):self.delivery('bob')

 def test_duplicate_event_and_channel_delivery_are_rejected(self):
  self.destination();self.event();self.delivery()
  with self.assertRaises(sqlite3.IntegrityError):self.event()
  with self.assertRaises(sqlite3.IntegrityError):self.delivery()
  self.event(revision=2)
  self.assertEqual(self.db.execute('SELECT count(*) FROM account_alert_events').fetchone()[0],2)

 def test_channels_are_independent_and_whatsapp_defaults_disabled(self):
  self.destination();self.destination(channel='whatsapp');self.event();self.delivery();self.delivery(channel='whatsapp')
  self.db.execute("UPDATE alert_destinations SET verified_at=1000,enabled=1 WHERE channel='email'")
  self.assertEqual(self.db.execute('SELECT channel,enabled FROM alert_destinations ORDER BY channel').fetchall(),[('email',1),('whatsapp',0)])
  self.assertEqual(self.db.execute('SELECT count(*) FROM account_alert_deliveries').fetchone()[0],2)

 def test_removed_target_cascades_only_its_own_alert_state(self):
  for user in ('alice','bob'):self.destination(user);self.event(user);self.delivery(user)
  self.db.execute("DELETE FROM watchlist_entries WHERE user_id='alice'")
  self.assertEqual(self.db.execute('SELECT user_id FROM account_alert_events').fetchall(),[('bob',)])
  self.assertEqual(self.db.execute('SELECT user_id FROM account_alert_deliveries').fetchall(),[('bob',)])

 def test_invalid_event_and_retry_count_are_rejected(self):
  self.destination();self.event();self.delivery()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE account_alert_events SET low_usd=11")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE account_alert_deliveries SET attempts=4')

if __name__=='__main__':unittest.main()
