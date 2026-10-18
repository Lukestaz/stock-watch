import argparse,json,os,sys,unittest,py_compile
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts'))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    suite=unittest.defaultTestLoader.discover(str(root/'scripts'),pattern='test_notifications_unit.py')
    with patch('socket.socket.connect',side_effect=RuntimeError('Network disabled in unit tests')),patch('socket.create_connection',side_effect=RuntimeError('Network disabled in unit tests')):
        result=unittest.TextTestRunner(verbosity=2).run(suite)
    syntax='passed';syntax_error=None
    try:py_compile.compile(str(root/'scripts/monitor.py'),doraise=True)
    except Exception as error:syntax='failed';syntax_error=type(error).__name__
    failed=len(result.failures)+len(result.errors)+len(result.unexpectedSuccesses)
    counts={'total':result.testsRun,'passed':result.testsRun-failed-len(result.skipped)-len(result.expectedFailures),'failed':failed,'skipped':len(result.skipped),'expectedFailures':len(result.expectedFailures)}
    failures=[{'test':test.id()[:200],'kind':kind} for entries,kind in [(result.failures,'assertion_failure'),(result.errors,'test_error')] for test,_ in entries][:20]
    failures.extend({'test':test.id()[:200],'kind':'unexpected_success'} for test in result.unexpectedSuccesses[:20-len(failures)])
    report={'schemaVersion':1,'kind':'notification_unit_tests','runId':os.getenv('GITHUB_RUN_ID'),'runAttempt':os.getenv('GITHUB_RUN_ATTEMPT'),'testedCommit':os.getenv('GITHUB_SHA'),'generatedAt':datetime.now(timezone.utc).isoformat(),'counts':counts,'monitorSyntax':syntax,'syntaxErrorCategory':syntax_error,'failures':failures,'liveMessagesSent':False}
    Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
    return 0 if result.wasSuccessful() and result.testsRun>0 and syntax=='passed' else 1
if __name__=='__main__':raise SystemExit(main())
