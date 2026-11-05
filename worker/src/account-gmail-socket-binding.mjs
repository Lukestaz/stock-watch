// Candidate Cloudflare socket binding only; not imported by production runtime.
import {connect} from 'cloudflare:sockets';
import {createGmailVerificationService} from './account-gmail-verification-service.mjs';
export const createWorkerGmailVerification=options=>createGmailVerificationService({...options,connect});
