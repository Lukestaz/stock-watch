// Candidate only. No runtime imports, schedules or credential reads.
import {createGmailSmtpTransport} from './account-gmail-smtp.mjs';
import {createD1VerificationMailBudget} from './account-verification-mail-budget.mjs';
import {createD1EmailOutbox} from './account-email-outbox.mjs';
import {createAccountEmailDispatcher} from './account-email-dispatcher.mjs';
export function createGmailFriendsDispatcher({enabled=false,db,connect,username,appPassword,timeoutMs,clock=()=>Math.floor(Date.now()/1000),mailLimits={},provider='shared-smtp',bindingRef=null}={}){
 if(enabled!==true)return createAccountEmailDispatcher();
 try{
  const transport=createGmailSmtpTransport({enabled:true,connect,username,appPassword,timeoutMs,purpose:'price-alert'});
  if(!transport.configured)throw Error();
  const outbox=createD1EmailOutbox(db,{enabled:true,provider,bindingRef});
  const reserve=createD1VerificationMailBudget(db,{globalDaily:50,globalMinute:5,userDaily:10,destinationDaily:10,cooldownSeconds:30,...mailLimits},{purpose:'price-alert'});
  return createAccountEmailDispatcher({enabled:true,outbox,reserve,from:username,send:message=>transport.send(message),clock});
 }catch{return createAccountEmailDispatcher();}
}
