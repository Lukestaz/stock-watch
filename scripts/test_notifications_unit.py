import contextlib,io,json,os,smtplib,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
import notifications as n
import notification_test as t

CONFIG={'GMAIL_USER':'sender@example.invalid','GMAIL_APP_PASSWORD':'fake password','ALERT_TO_EMAIL':'recipient@example.invalid','WHATSAPP_PHONE':'000000','WHATSAPP_API_KEY':'fake-key','GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1'}
class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,CONFIG,clear=True);self.env.start();self.addCleanup(self.env.stop)
        self.smtp=patch.object(n.smtplib,'SMTP_SSL');self.smtp_class=self.smtp.start();self.addCleanup(self.smtp.stop)
        self.http=patch.object(n.urllib.request,'urlopen');self.http_mock=self.http.start();self.addCleanup(self.http.stop)
        self.client=self.smtp_class.return_value;self.client.send_message.return_value={}
    def run_cli(self,channel='email',confirm=True):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'result.json';args=['--channel',channel,'--output',str(path)]
            if confirm:args.append('--confirm-send')
            with contextlib.redirect_stdout(io.StringIO()):code=t.main(args)
            return code,json.loads(path.read_text())
    def test_no_confirmation_does_not_send(self):
        code,result=self.run_cli(confirm=False);self.assertEqual(code,1);self.assertEqual(result['outcome'],'not_sent');self.smtp_class.assert_not_called();self.http_mock.assert_not_called()
    def test_missing_configuration_does_not_connect(self):
        os.environ.pop('ALERT_TO_EMAIL');code,result=self.run_cli();self.assertEqual(result['outcome'],'not_sent');self.assertFalse(result['sendAttempted']);self.smtp_class.assert_not_called()
    def test_email_accepted_not_delivered_and_labelled(self):
        code,result=self.run_cli();self.assertEqual(code,0);self.assertEqual(result['receipt'],'unverified')
        msg=self.client.send_message.call_args.args[0];self.assertEqual(msg['Subject'],t.SUBJECT);self.assertIn('123/1',msg.get_content());self.client.send_message.assert_called_once();self.http_mock.assert_not_called()
        for value in CONFIG.values():
            if len(value)>5:self.assertNotIn(value,json.dumps(result))
    def test_email_timeout_is_unknown_no_retry(self):
        self.client.send_message.side_effect=TimeoutError('private raw detail');code,result=self.run_cli();self.assertEqual(result['outcome'],'outcome_unknown');self.client.send_message.assert_called_once();self.assertNotIn('private',json.dumps(result))
    def test_login_failure_is_not_sent(self):
        self.client.login.side_effect=smtplib.SMTPAuthenticationError(535,b'private');code,result=self.run_cli();self.assertEqual(result['outcome'],'not_sent');self.client.send_message.assert_not_called()
    def test_explicit_smtp_rejection(self):
        self.client.send_message.side_effect=smtplib.SMTPDataError(550,b'private');code,result=self.run_cli();self.assertEqual(result['outcome'],'failed')
    def test_whatsapp_accepted_once(self):
        self.http_mock.return_value.__enter__.return_value.read.return_value=b'Message queued';code,result=self.run_cli('whatsapp');self.assertEqual(code,0);self.assertEqual(result['outcome'],'accepted');self.http_mock.assert_called_once();self.smtp_class.assert_not_called()
    def test_whatsapp_timeout_is_unknown(self):
        self.http_mock.side_effect=TimeoutError('secret URL');code,result=self.run_cli('whatsapp');self.assertEqual(result['outcome'],'outcome_unknown');self.http_mock.assert_called_once();self.assertNotIn('secret URL',json.dumps(result))
    def test_whatsapp_negative_response_not_accepted(self):
        self.http_mock.return_value.__enter__.return_value.read.return_value=b'Error: message not sent';code,result=self.run_cli('whatsapp');self.assertEqual(result['outcome'],'failed')
    def test_whatsapp_ambiguous_response_is_unknown(self):
        self.http_mock.return_value.__enter__.return_value.read.return_value=b'Please check later';code,result=self.run_cli('whatsapp');self.assertEqual(result['outcome'],'outcome_unknown')
    def test_imports_do_not_load_monitor_or_access_files(self):
        import sys
        self.assertNotIn('monitor',sys.modules)
        with patch.object(Path,'read_text',side_effect=AssertionError('state read')),patch.object(Path,'write_text',side_effect=AssertionError('state write')):
            import importlib;importlib.reload(n);importlib.reload(t)
        self.smtp_class.assert_not_called();self.http_mock.assert_not_called()
if __name__=='__main__':unittest.main()
