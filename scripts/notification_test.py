import argparse,json,os,re
from datetime import datetime,timezone
from pathlib import Path
from notifications import NotificationError,send_email,send_whatsapp

SUBJECT='[TEST] Stock Watch notification check'
def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--channel',choices=['email','whatsapp'],required=True)
    parser.add_argument('--confirm-send',action='store_true')
    parser.add_argument('--output',required=True)
    args=parser.parse_args(argv)
    run=os.environ.get('GITHUB_RUN_ID','local');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','1')
    if not re.fullmatch(r'[A-Za-z0-9_-]+',run) or not re.fullmatch(r'[0-9]+',attempt):parser.error('Invalid run identifier')
    test_id=run+'/'+attempt
    body=f'Stock Watch notification test.\nChannel: {args.channel}\nTest ID: {test_id}\nThis is a delivery check, not a price alert. No stock targets or alert state were changed.'
    result={'schemaVersion':1,'channel':args.channel,'testId':test_id,'runId':run,'runAttempt':attempt,'testedCommit':os.environ.get('GITHUB_SHA'),'generatedAt':datetime.now(timezone.utc).isoformat(),'outcome':'not_sent','errorCategory':'send_not_confirmed','sendAttempted':False,'receipt':'unverified'}
    if args.confirm_send:
        try:
            if args.channel=='email':send_email(body,subject=SUBJECT)
            else:send_whatsapp(body)
            result.update(outcome='accepted',errorCategory=None,sendAttempted=True)
        except NotificationError as error:
            result.update(outcome=error.outcome,errorCategory=error.category,sendAttempted=error.attempted)
        except Exception:
            result.update(outcome='outcome_unknown',errorCategory='unexpected_sender_error',sendAttempted=True)
    Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'channel':args.channel,'testId':test_id,'outcome':result['outcome'],'receipt':'unverified'}))
    return 0 if result['outcome']=='accepted' else 1
if __name__=='__main__':raise SystemExit(main())
