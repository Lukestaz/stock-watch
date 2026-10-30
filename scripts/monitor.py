import os,json,urllib.request,urllib.parse,math
from notifications import send_email,send_whatsapp
from alert_rules import reconcile_target,match_kind,rearm,event_is_current
from datetime import datetime,timedelta,timezone
from pathlib import Path

now=datetime.now(timezone.utc)
targets=json.loads(Path('config/targets.json').read_text())
statepath=Path('state/monitor.json')
state=json.loads(statepath.read_text()) if statepath.exists() else {'stocks':{},'events':{}}
publicpath=Path('site/data.json')
public=json.loads(publicpath.read_text())
oldstocks={s['symbol']:s for s in public['stocks']}
key=os.getenv('ALPACA_KEY');secret=os.getenv('ALPACA_SECRET')
email_ready=all(os.getenv(x) for x in ['GMAIL_USER','GMAIL_APP_PASSWORD','ALERT_TO_EMAIL'])
wa_ready=all(os.getenv(x) for x in ['WHATSAPP_PHONE','WHATSAPP_API_KEY'])

def request(url,headers=None):
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers or {}),timeout=30) as r:
        return r.read().decode()

def market(path):
    return json.loads(request('https://data.alpaca.markets'+path,{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret}))

def bars(symbol,start,end,timeframe,adjustment):
    result=[];token=None
    while True:
        q={'start':start,'end':end,'timeframe':timeframe,'adjustment':adjustment,'feed':'sip','limit':10000,'sort':'asc'}
        if token:q['page_token']=token
        data=market('/v2/stocks/'+symbol+'/bars?'+urllib.parse.urlencode(q))
        result.extend(data.get('bars') or [])
        token=data.get('next_page_token')
        if not token:return result

def save():
    statepath.parent.mkdir(exist_ok=True)
    statepath.write_text(json.dumps(state,indent=2))

# Reconcile even when provider credentials are absent; delivery must reject old targets.
for symbol,target in targets.items():
    state['stocks'][symbol]=reconcile_target(state['stocks'].get(symbol,{}),target)

public={'updated':now.isoformat(),'status':'OK' if key and secret else 'Alpaca credentials missing','email':'configured, delivery unverified' if email_ready else 'not configured','whatsapp':'configured, delivery unverified' if wa_ready else 'not configured','stocks':[]}
end=(now-timedelta(minutes=16)).isoformat()
errors=False
for symbol,target in targets.items():
    display=oldstocks.get(symbol,{'symbol':symbol,'target':target})
    display['target']=target
    if not key or not secret:
        display['status']='Credentials missing';public['stocks'].append(display);continue
    s=state['stocks'][symbol]
    try:
        start=s.get('last') or (now-timedelta(minutes=45)).isoformat()
        start=max(start,(now-timedelta(days=7)).isoformat())
        data=bars(symbol,start,end,'1Min','raw')
        for b in data:
            if b['t']<=s.get('last',''):continue
            if not all(type(b.get(x)) in (int,float) and math.isfinite(b[x]) and b[x]>0 for x in ['l','c']):continue
            if b['l']>b['c']:continue
            when=datetime.fromisoformat(b['t'].replace('Z','+00:00'))
            age=(now-when).total_seconds()
            if age<900:continue
            s['last']=b['t']
            s['armed']=rearm(s['armed'],b['c'],target)
            kind=match_kind(b['l'],target)
            if kind and s['armed'].get(kind) and age<=3600:
                eid=symbol+'-r'+str(s['target_revision'])+'-'+kind+'-'+b['t']
                state['events'].setdefault(eid,{'symbol':symbol,'kind':kind,'target':target,'target_revision':s['target_revision'],'low':b['l'],'time':b['t'],'email':'pending','whatsapp':'pending' if kind=='target' else 'skipped','attempts':{'email':0,'whatsapp':0}})
                s['armed'][kind]=False
                if kind=='target':s['armed']['near']=False
            display.update(price=b['c'],time=b['t'],status='delayed SIP')
        if not data:display['status']='No new bars; verify symbol and timestamp'
        if s.get('history_day')!=now.date().isoformat():
            history=bars(symbol,(now-timedelta(days=731)).isoformat(),end,'1Day','split')
            display['history']=[{'t':b['t'],'c':b['c'],'l':b['l']} for b in history]
            s['history_day']=now.date().isoformat()
    except Exception as e:
        display['status']='Data fetch failed; consult Actions logs';errors=True
        print(symbol,'fetch failed:',type(e).__name__)
    public['stocks'].append(display)
save()
for eid,e in state['events'].items():
    if not event_is_current(e,targets,state['stocks']):
        for channel in ['email','whatsapp']:
            if e.get(channel)=='pending':e[channel]='superseded'
        save()
        continue
    text=f"{e['symbol']} {e['kind']} review level: target ${e['target']}; observed low ${e['low']}; market timestamp {e['time']}. Consolidated data delayed at least 15 minutes. Check current price in Tiger. Not an automatic buy instruction."
    for channel,ready in [('email',email_ready),('whatsapp',wa_ready)]:
        if e[channel]!='pending' or not ready or e['attempts'][channel]>=3:continue
        if now-datetime.fromisoformat(e['time'].replace('Z','+00:00'))>timedelta(hours=2):e[channel]='expired';continue
        e['attempts'][channel]+=1;save()
        try:
            if channel=='email':send_email(text)
            else:send_whatsapp(text)
            e[channel]='accepted';public[channel]='last send accepted; delivery not independently verified'
        except Exception as exc:
            errors=True;print(channel,'send failed:',type(exc).__name__)
            if e['attempts'][channel]>=3:e[channel]='failed'
        save()
if errors:public['status']='Some operations failed; check Actions logs and data timestamps'
publicpath.write_text(json.dumps(public))
