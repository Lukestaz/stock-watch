"""Offline monitor integration: real adapter/formatter, mocked transports and market."""
import io,json,os,runpy,tempfile,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import Mock,patch
from alert_rules import reconcile_target
import notifications

MONITOR=Path(__file__).with_name('monitor.py')

class MonitorIntegrationTests(unittest.TestCase):
    def run_monitor(self,targets=None,state=None,bars=None,credentials=True,fail=False,missing=()):
        email=Mock(side_effect=RuntimeError('synthetic') if fail else None)
        whatsapp=Mock()
        def response(request,**kwargs):
            payload={'bars': [] if 'timeframe=1Day' in request.full_url else (bars or [])}
            return io.BytesIO(json.dumps(payload).encode())
        env={k:'synthetic' for k in ['GMAIL_USER','GMAIL_APP_PASSWORD','ALERT_TO_EMAIL','WHATSAPP_PHONE','WHATSAPP_API_KEY']}
        if credentials: env.update(ALPACA_KEY='synthetic',ALPACA_SECRET='synthetic')
        for key in missing:env.pop(key,None)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for directory in ['config','state','site']: (root/directory).mkdir()
            (root/'config/targets.json').write_text(json.dumps({'ABC':10} if targets is None else targets))
            (root/'state/monitor.json').write_text(json.dumps(state or {'stocks':{},'events':{}}))
            (root/'site/data.json').write_text(json.dumps({'stocks':[]}))
            old=os.getcwd()
            try:
                os.chdir(root)
                with patch.dict(os.environ,env,clear=True), patch.object(notifications,'send_email',email), patch.object(notifications,'send_whatsapp',whatsapp), patch('urllib.request.urlopen',side_effect=response), patch('socket.socket.connect',side_effect=RuntimeError('Network disabled')), patch('socket.create_connection',side_effect=RuntimeError('Network disabled')):
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
        self.assertIn('ABC - target reached',email.call_args.kwargs['subject'])
        self.assertIn('<!doctype html>',email.call_args.kwargs['html'])
        self.assertIn('Observed low: $10.00',email.call_args.args[0])
        self.assertIn('ABC - target reached',wa.call_args.args[0])
        self.assertIn('Observed low: $10.00',wa.call_args.args[0])
        self.assertIn('UTC',wa.call_args.args[0])
        self.assertIn('not a live or executable quote',email.call_args.args[0])
        event=next(iter(state['events'].values()))
        self.assertEqual((event['email'],event['whatsapp']),('accepted','accepted'))
        state,email,wa=self.run_monitor(state=state,bars=[bar])
        self.assertEqual(len(state['events']),1)
        email.assert_not_called();wa.assert_not_called()

    def test_near_is_email_only(self):
        state,email,wa=self.run_monitor(bars=[self.bar(low=10.5,close=10.5)])
        self.assertEqual(next(iter(state['events'].values()))['kind'],'near')
        email.assert_called_once();wa.assert_not_called()
        self.assertIn('ABC - near target',email.call_args.kwargs['subject'])
        self.assertNotIn('target reached',email.call_args.kwargs['html'])

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

    def test_expired_pending_event_does_not_send(self):
        event=self.event();event['time']=self.bar(minutes=130)['t']
        state,email,wa=self.run_monitor(state={'stocks':{'ABC':reconcile_target({},10)},'events':{'old':event}},credentials=False)
        self.assertEqual((state['events']['old']['email'],state['events']['old']['whatsapp']),('expired','expired'))
        email.assert_not_called();wa.assert_not_called()

    def test_missing_channel_configuration_leaves_pending_without_attempt(self):
        for missing,disabled in [(('ALERT_TO_EMAIL',),'email'),(('WHATSAPP_PHONE',),'whatsapp')]:
            state,email,wa=self.run_monitor(bars=[self.bar()],missing=missing)
            event=next(iter(state['events'].values()))
            self.assertEqual(event[disabled],'pending');self.assertEqual(event['attempts'][disabled],0)
            if disabled=='email':email.assert_not_called();wa.assert_called_once()
            else:wa.assert_not_called();email.assert_called_once()

    def test_attempt_limit_is_preserved(self):
        event=self.event();event['attempts']={'email':3,'whatsapp':3}
        state,email,wa=self.run_monitor(state={'stocks':{'ABC':reconcile_target({},10)},'events':{'old':event}},credentials=False)
        self.assertEqual(state['events']['old']['attempts'],{'email':3,'whatsapp':3})
        email.assert_not_called();wa.assert_not_called()

    def test_invalid_observation_rejected_before_transports(self):
        event=self.event();event['low']=11
        state,email,wa=self.run_monitor(state={'stocks':{'ABC':reconcile_target({},10)},'events':{'old':event}},credentials=False)
        event=state['events']['old']
        self.assertEqual((event['email'],event['whatsapp']),('pending','pending'))
        self.assertEqual(event['attempts'],{'email':1,'whatsapp':1})
        email.assert_not_called();wa.assert_not_called()

if __name__=='__main__': unittest.main()
