"""Offline monitor integration: all network and notification calls intercepted."""
import io,json,os,runpy,tempfile,types,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import Mock,patch
from alert_rules import reconcile_target

MONITOR=Path(__file__).with_name('monitor.py')

class MonitorIntegrationTests(unittest.TestCase):
    def run_monitor(self,targets=None,state=None,bars=None,credentials=True,fail=False):
        email=Mock(side_effect=RuntimeError('synthetic') if fail else None)
        whatsapp=Mock()
        sender=types.ModuleType('notifications')
        sender.send_email=email;sender.send_whatsapp=whatsapp
        def response(request,**kwargs):
            payload={'bars': [] if 'timeframe=1Day' in request.full_url else (bars or [])}
            return io.BytesIO(json.dumps(payload).encode())
        env={k:'synthetic' for k in ['GMAIL_USER','GMAIL_APP_PASSWORD','ALERT_TO_EMAIL','WHATSAPP_PHONE','WHATSAPP_API_KEY']}
        if credentials: env.update(ALPACA_KEY='synthetic',ALPACA_SECRET='synthetic')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for directory in ['config','state','site']: (root/directory).mkdir()
            (root/'config/targets.json').write_text(json.dumps({'ABC':10} if targets is None else targets))
            (root/'state/monitor.json').write_text(json.dumps(state or {'stocks':{},'events':{}}))
            (root/'site/data.json').write_text(json.dumps({'stocks':[]}))
            old=os.getcwd()
            try:
                os.chdir(root)
                with patch.dict(os.environ,env,clear=True), patch.dict('sys.modules',{'notifications':sender}), patch('urllib.request.urlopen',side_effect=response):
                    runpy.run_path(str(MONITOR),run_name='__main__')
            finally: os.chdir(old)
            result=json.loads((root/'state/monitor.json').read_text())
        return result,email,whatsapp

    def bar(self,minutes=20,low=10,close=10):
        return {'t':(datetime.now(timezone.utc)-timedelta(minutes=minutes)).isoformat(),'l':low,'c':close}

    def event(self,revision=1,target=10):
        return {'symbol':'ABC','kind':'target','target':target,'target_revision':revision,'low':9,'time':self.bar()['t'],'email':'pending','whatsapp':'pending','attempts':{'email':0,'whatsapp':0}}

    def test_target_hit_then_rerun_does_not_duplicate(self):
        bar=self.bar()
        state,email,wa=self.run_monitor(bars=[bar])
        self.assertEqual(len(state['events']),1)
        email.assert_called_once();wa.assert_called_once()
        state,email,wa=self.run_monitor(state=state,bars=[bar])
        self.assertEqual(len(state['events']),1)
        email.assert_not_called();wa.assert_not_called()

    def test_near_is_email_only(self):
        state,email,wa=self.run_monitor(bars=[self.bar(low=10.5,close=10.5)])
        self.assertEqual(next(iter(state['events'].values()))['kind'],'near')
        email.assert_called_once();wa.assert_not_called()

    def test_changed_target_supersedes_pending_without_provider_credentials(self):
        state={'stocks':{'ABC':reconcile_target({},10)},'events':{'old':self.event()}}
        state,email,wa=self.run_monitor(targets={'ABC':9},state=state,credentials=False)
        self.assertEqual(state['stocks']['ABC']['target_revision'],2)
        self.assertEqual(state['events']['old']['email'],'superseded')
        email.assert_not_called();wa.assert_not_called()

    def test_removed_symbol_and_unversioned_events_do_not_send(self):
        for targets in [{},{'ABC':10}]:
            event=self.event();event.pop('target_revision')
            state,email,wa=self.run_monitor(targets=targets,state={'stocks':{},'events':{'old':event}},credentials=False)
            self.assertEqual(state['events']['old']['whatsapp'],'superseded')
            email.assert_not_called();wa.assert_not_called()

    def test_stale_and_invalid_bars_do_not_alert(self):
        for bar in [self.bar(minutes=80),self.bar(low=True),self.bar(low=11,close=10),self.bar(minutes=-1)]:
            state,email,wa=self.run_monitor(bars=[bar])
            self.assertEqual(state['events'],{})
            email.assert_not_called();wa.assert_not_called()

    def test_failed_delivery_retries_same_event(self):
        state,email,wa=self.run_monitor(bars=[self.bar()],fail=True)
        self.assertEqual(len(state['events']),1)
        event=next(iter(state['events'].values()))
        self.assertEqual(event['email'],'pending')
        self.assertEqual(event['attempts']['email'],1)
        state,email,wa=self.run_monitor(state=state,bars=[])
        self.assertEqual(len(state['events']),1)
        self.assertEqual(next(iter(state['events'].values()))['attempts']['email'],2)
        email.assert_called_once();wa.assert_not_called()

if __name__=='__main__': unittest.main()
