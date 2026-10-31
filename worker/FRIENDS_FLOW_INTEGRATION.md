# Recovered friends email integration: candidate only

Recovery checked draft PR #4 at 7ec2578. No newer changes existed at that check; all 22 reported test jobs passed and one summary job was skipped. No failed-generation write was repeated.

This patch connects the existing consent API/store to actual cookie-session authentication inside createGmailVerificationService, reusing its durable admission/account controls. Internal /v1/alert-consent/email GET/PUT now dispatches to that consent service when the candidate factory is explicitly enabled. Email verification routing remains unchanged. The separate enrollmentEnabled option defaults false and is passed as a literal boolean gate to both the API and store. Consent does not enable evaluation or create a schedule. Nothing imports this candidate into the production Worker.

No migrations, deployment, credentials, live email or production enrolment are changed. The live site remains untouched. The existing preview alert controls remain disabled; connecting usable consent UI and the scheduled market input is still release work.

Three isolated local composition checks passed using mocked module dependencies: disabled routing, authenticated consent delegation and default-off enrolment forwarding. These checks are not actual session/SQL integration.

Five new integration tests passed local syntax checking but have not executed locally. They must pass CI before this patch can be called verified. CI uses actual session, verification, consent, evaluator, dispatcher, quota and SMTP protocol modules with the repository migration chain on file-backed SQLite. Session rows and market observations are seeded, while SMTP sockets and trusted edge metadata are faked. The main test registers/verifies two separate email addresses, opts in distinct targets through authenticated HTTP, produces alerts from one observation, checks separate SMTP recipients/target content, confirms no duplicate sends, then opts one account out and checks only the other receives a later event. Further tests cover unverified recipients, mismatched account preconditions, default-off enrolment and anonymous access.

This is an offline application-flow gate, not live Gmail delivery, Cloudflare runtime/TLS, actual D1 or browser verification. Remaining activation work is real consent UI and runtime/scheduled market wiring, Worker/TLS checks, secure secret provisioning, private migrations and explicitly approved deployment/live tests. Do not mark PR #4 ready merely because this candidate code compiles.
