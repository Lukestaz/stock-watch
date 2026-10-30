import os,sys,smtplib,types,unittest
from email import policy
from email.parser import BytesParser
from unittest.mock import Mock,patch
from urllib.parse import urlparse,parse_qs
import notifications as n

CONFIG={'GMAIL_USER':'sender@example.invalid','GMAIL_APP_PASSWORD':'fake password','ALERT_TO_EMAIL':'recipient@example.invalid','WHATSAPP_PHONE':'000000','WHATSAPP_API_KEY':'fake-key'}
MESSAGE={'subject':'Stock Watch | LUNR - target reached | $10.50','text':'LUNR target reached\nObserved low: $10.45\nYour target: $10.50\nDelayed data.','html':'<html><body><h1>LUNR - target reached</h1><p>Observed low: $10.45</p></body></html>','whatsapp':'Stock Watch | LUNR - target reached\nObserved low: $10.45\nTarget: $10.50'}

class FormattedTransportTests(unittest.TestCase):
    def setUp(self):
        for target,value in [('socket.socket.connect',RuntimeError('Network disabled')),('socket.create_connection',RuntimeError('Network disabled'))]:
            blocker=patch(target,side_effect=value);blocker.start();self.addCleanup(blocker.stop)
        env=patch.dict(os.environ,CONFIG,clear=True);env.start();self.addCleanup(env.stop)
        smtp=patch.object(n.smtplib,'SMTP_SSL');self.smtp=smtp.start();self.addCleanup(smtp.stop)
        http=patch.object(n.urllib.request,'urlopen');self.http=http.start();self.addCleanup(http.stop)
        self.client=self.smtp.return_value;self.client.send_message.return_value={}
        self.http.return_value.__enter__.return_value.read.return_value=b'Message queued'
        self.event={'symbol':'LUNR','kind':'target','target':10.5,'low':10.45,'time':'2026-10-30T00:00:00Z'}
        self.formatter=Mock(return_value=MESSAGE.copy())
        module=types.ModuleType('alert_formatting');module.format_alert=self.formatter
        modules=patch.dict(sys.modules,{'alert_formatting':module});modules.start();self.addCleanup(modules.stop)

    def test_email_adapter_multipart_roundtrip(self):
        self.assertEqual(n.send_formatted_alert(self.event,'email'),'accepted')
        self.formatter.assert_called_once_with(self.event)
        self.client.send_message.assert_called_once();self.http.assert_not_called()
        msg=BytesParser(policy=policy.default).parsebytes(self.client.send_message.call_args.args[0].as_bytes())
        self.assertEqual(msg.get_content_type(),'multipart/alternative')
        self.assertEqual([p.get_content_type() for p in msg.iter_parts()],['text/plain','text/html'])
        self.assertEqual(msg.get_body(preferencelist=('plain',)).get_content().strip(),MESSAGE['text'])
        self.assertEqual(msg.get_body(preferencelist=('html',)).get_content().strip(),MESSAGE['html'])
        self.assertEqual(str(msg['Subject']),MESSAGE['subject'])
        self.assertEqual(str(msg['To']),CONFIG['ALERT_TO_EMAIL'])
        self.client.close.assert_called_once()

    def test_plain_text_legacy_signature_unchanged(self):
        self.assertEqual(n.send_email('Legacy body','Legacy subject'),'accepted')
        msg=self.client.send_message.call_args.args[0]
        self.assertFalse(msg.is_multipart());self.assertEqual(msg.get_content_type(),'text/plain')
        self.assertEqual(msg['Subject'],'Legacy subject');self.assertEqual(msg.get_content().strip(),'Legacy body')
        self.http.assert_not_called()

    def test_whatsapp_exact_formatted_text_once(self):
        self.assertEqual(n.send_formatted_alert(self.event,'whatsapp'),'accepted')
        self.http.assert_called_once();self.smtp.assert_not_called();self.formatter.assert_called_once_with(self.event)
        query=parse_qs(urlparse(self.http.call_args.args[0]).query)
        self.assertEqual(query['text'],[MESSAGE['whatsapp']]);self.assertEqual(query['phone'],[CONFIG['WHATSAPP_PHONE']])
        self.assertEqual(self.http.call_args.kwargs['timeout'],30)

    def test_unknown_channel_never_formats_or_sends(self):
        with self.assertRaises(ValueError):n.send_formatted_alert(self.event,'both')
        self.formatter.assert_not_called();self.smtp.assert_not_called();self.http.assert_not_called()

    def test_invalid_event_does_not_connect(self):
        self.formatter.side_effect=ValueError('Invalid event')
        for channel in ('email','whatsapp'):
            with self.assertRaises(ValueError):n.send_formatted_alert({},channel)
        self.smtp.assert_not_called();self.http.assert_not_called()

    def test_missing_selected_channel_configuration_no_fallback(self):
        for channel,key in [('email','ALERT_TO_EMAIL'),('whatsapp','WHATSAPP_PHONE')]:
            with patch.dict(os.environ,{key:''}):
                with self.assertRaises(n.NotificationError) as caught:n.send_formatted_alert(self.event,channel)
                self.assertEqual(caught.exception.outcome,'not_sent');self.assertFalse(caught.exception.attempted)
        self.smtp.assert_not_called();self.http.assert_not_called()

    def test_email_timeout_no_retry_or_fallback(self):
        self.client.send_message.side_effect=TimeoutError('private detail')
        with self.assertRaises(n.NotificationError) as caught:n.send_formatted_alert(self.event,'email')
        self.assertEqual(caught.exception.outcome,'outcome_unknown');self.assertTrue(caught.exception.attempted)
        self.assertNotIn('private',str(caught.exception));self.client.send_message.assert_called_once();self.http.assert_not_called()

    def test_smtp_rejection_keeps_existing_classification(self):
        self.client.send_message.side_effect=smtplib.SMTPDataError(550,b'private detail')
        with self.assertRaises(n.NotificationError) as caught:n.send_formatted_alert(self.event,'email')
        self.assertEqual(caught.exception.category,'smtp_rejected');self.assertEqual(caught.exception.outcome,'failed')
        self.client.send_message.assert_called_once();self.http.assert_not_called()

    def test_whatsapp_timeout_no_retry_or_fallback(self):
        self.http.side_effect=TimeoutError('secret URL')
        with self.assertRaises(n.NotificationError) as caught:n.send_formatted_alert(self.event,'whatsapp')
        self.assertEqual(caught.exception.outcome,'outcome_unknown');self.assertTrue(caught.exception.attempted)
        self.assertNotIn('secret',str(caught.exception));self.http.assert_called_once();self.smtp.assert_not_called()

    def test_whatsapp_negative_and_ambiguous_responses(self):
        for body,outcome in [(b'Error: message not sent','failed'),(b'Please check later','outcome_unknown')]:
            self.http.return_value.__enter__.return_value.read.return_value=body
            with self.assertRaises(n.NotificationError) as caught:n.send_formatted_alert(self.event,'whatsapp')
            self.assertEqual(caught.exception.outcome,outcome)
        self.assertEqual(self.http.call_count,2);self.smtp.assert_not_called()

if __name__=='__main__':unittest.main()
