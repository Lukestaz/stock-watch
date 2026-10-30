// Candidate service only. No environment flags or production imports enable it.
import {createGmailSmtpTransport} from './account-gmail-smtp.mjs';
import {createD1VerificationControls} from './account-verification-controls.mjs';
import {createBudgetedAlertDestinationApi} from './account-budgeted-verification.mjs';
export function createGmailVerificationService({enabled=false,connect,username,appPassword,timeoutMs,db,admissionKey,requestLimits,clock,limits,...settings}={}){
 let handler=createBudgetedAlertDestinationApi(),cleanup=null;
 if(enabled===true){
  try{
   const transport=createGmailSmtpTransport({enabled:true,connect,username,appPassword,timeoutMs});
   if(!transport.configured)throw Error();
   const controls=createD1VerificationControls({db,admissionKey,limits:requestLimits,clock});
   handler=createBudgetedAlertDestinationApi({...settings,enabled:true,db,clock,limits,from:username,send:message=>transport.send(message),admit:controls.admit,limit:controls.limit});cleanup=controls.cleanup;
  }catch{}
 }
 return {fetch:request=>handler(request),cleanup:async()=>cleanup?cleanup():false};
}
