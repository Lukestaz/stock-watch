// Candidate service only. Production imports and enrolment remain disabled.
import {createGmailSmtpTransport} from './account-gmail-smtp.mjs';
import {createD1VerificationControls} from './account-verification-controls.mjs';
import {createBudgetedAlertDestinationApi} from './account-budgeted-verification.mjs';
import {createIdentityService} from './account-identity.mjs';
import {createD1AccountAlertStore} from './account-alert-store.mjs';
import {createAccountAlertConsentApi} from './account-alert-consent-api.mjs';
export function createGmailVerificationService({enabled=false,enrollmentEnabled=false,connect,username,appPassword,timeoutMs,db,admissionKey,requestLimits,clock,limits,...settings}={}){
 let handler=createBudgetedAlertDestinationApi(),consent=createAccountAlertConsentApi(),cleanup=null;
 if(enabled===true){
  try{
   const transport=createGmailSmtpTransport({enabled:true,connect,username,appPassword,timeoutMs});
   if(!transport.configured)throw Error();
   const controls=createD1VerificationControls({db,admissionKey,limits:requestLimits,clock});
   const identity=createIdentityService({db,clientId:settings.clientId,loadGoogleKeys:settings.loadGoogleKeys,clock});
   const store=createD1AccountAlertStore(db,{enrollmentEnabled:enrollmentEnabled===true});
   const nextConsent=createAccountAlertConsentApi({enabled:true,enrollmentEnabled:enrollmentEnabled===true,allowedOrigin:settings.allowedOrigin,
    authenticate:request=>identity.authenticate(request),admit:controls.admit,limit:controls.limit,store,clock});
   const nextHandler=createBudgetedAlertDestinationApi({...settings,enabled:true,db,clock,limits,from:username,send:message=>transport.send(message),admit:controls.admit,limit:controls.limit});
   handler=nextHandler;consent=nextConsent;cleanup=controls.cleanup;
  }catch{}
 }
 return {
  async fetch(request){
   try{return await (new URL(request.url).pathname==='/v1/alert-consent/email'?consent:handler)(request);}
   catch{return new Response(JSON.stringify({error:'Account email service unavailable'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  },
  cleanup:async()=>cleanup?cleanup():false
 };
}
