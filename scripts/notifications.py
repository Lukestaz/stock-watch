import os,re,smtplib,ssl,urllib.request,urllib.parse
from email.message import EmailMessage

class NotificationError(Exception):
    def __init__(self,outcome,category,attempted=False):
        super().__init__(category)
        self.outcome=outcome;self.category=category;self.attempted=attempted

def required(names):
    if any(not os.environ.get(name) for name in names):
        raise NotificationError('not_sent','missing_configuration')

def send_email(text,subject='Space Stock Watch: review threshold',*,html=None):
    required(['GMAIL_USER','GMAIL_APP_PASSWORD','ALERT_TO_EMAIL'])
    msg=EmailMessage();msg['From']=os.environ['GMAIL_USER'];msg['To']=os.environ['ALERT_TO_EMAIL'];msg['Subject']=subject;msg.set_content(text)
    if html is not None:msg.add_alternative(html,subtype='html')
    smtp=None;submitted=False
    try:
        smtp=smtplib.SMTP_SSL('smtp.gmail.com',465,context=ssl.create_default_context(),timeout=30)
        smtp.login(os.environ['GMAIL_USER'],os.environ['GMAIL_APP_PASSWORD'].replace(' ',''))
        submitted=True
        refused=smtp.send_message(msg)
        if refused:raise NotificationError('outcome_unknown','partial_recipient_rejection',True)
        return 'accepted'
    except NotificationError:raise
    except (smtplib.SMTPRecipientsRefused,smtplib.SMTPSenderRefused,smtplib.SMTPDataError):
        raise NotificationError('failed','smtp_rejected',submitted) from None
    except Exception:
        raise NotificationError('outcome_unknown' if submitted else 'not_sent','smtp_transport_error',submitted) from None
    finally:
        if smtp is not None:
            try:smtp.close()
            except Exception:pass

def send_whatsapp(text):
    required(['WHATSAPP_PHONE','WHATSAPP_API_KEY'])
    q=urllib.parse.urlencode({'phone':os.environ['WHATSAPP_PHONE'],'apikey':os.environ['WHATSAPP_API_KEY'],'text':text})
    try:
        with urllib.request.urlopen('https://api.callmebot.com/whatsapp.php?'+q,timeout=30) as response:
            answer=response.read(65536).decode('utf8',errors='replace').lower()
    except Exception:
        raise NotificationError('outcome_unknown','gateway_transport_error',True) from None
    if re.search(r'not\s+(?:sent|queued)|error|invalid|failed',answer):
        raise NotificationError('failed','gateway_rejected',True)
    if not re.search(r'\b(?:queued|sent)\b',answer):
        raise NotificationError('outcome_unknown','gateway_response_unrecognised',True)
    return 'accepted'

def send_formatted_alert(event,channel):
    """Send only the explicitly selected channel to existing configured recipients.

    Caller owns consent, target freshness, expiry, deduplication and retry policy.
    No automatic fallback to another channel; acceptance is not delivery proof.
    """
    if channel not in ('email','whatsapp'):
        raise ValueError('Invalid notification channel')
    from alert_formatting import format_alert
    message=format_alert(event)
    if channel=='email':
        return send_email(message['text'],subject=message['subject'],html=message['html'])
    return send_whatsapp(message['whatsapp'])
