[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repositoryRoot

try {
    $localStatusJson = & supabase status --output json
    if ($LASTEXITCODE -ne 0) {
        throw 'Local Supabase is not running.'
    }

    $localStatus = $localStatusJson | ConvertFrom-Json
    $apiUrl = [Uri]$localStatus.API_URL
    if ($apiUrl.Host -notin @('localhost', '127.0.0.1')) {
        throw 'Local document-security regression refuses a non-loopback Supabase URL.'
    }

    $env:AVEND_LOCAL_STATUS_BASE64 = [Convert]::ToBase64String(
        [Text.Encoding]::UTF8.GetBytes($localStatusJson)
    )

    @'
const status = JSON.parse(Buffer.from(process.env.AVEND_LOCAL_STATUS_BASE64, 'base64').toString('utf8'));
const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, MAILPIT_URL: mailboxUrl } = status;
const emailPrefix = 'avend-local-document-security-';
const email = `${emailPrefix}${Date.now()}@avend.local`;
const password = 'AvendLocal!2026Document';
const testPath = `security-regression/${Date.now()}.pdf`;
let stage = 'bootstrap';

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { response, body };
}

async function waitForConfirmationEmail() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { body } = await request(`${mailboxUrl}/api/v1/messages?limit=100`);
    for (const message of body.messages ?? []) {
      const id = message.ID ?? message.id;
      if (!id) continue;
      const detail = await request(`${mailboxUrl}/api/v1/message/${id}`);
      const serialized = JSON.stringify(detail.body).replaceAll('&amp;', '&');
      if (serialized.includes(email) && serialized.toLowerCase().includes('confirm')) return serialized;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('LOCAL_EMAIL_TIMEOUT');
}

async function deleteUnexpectedObject() {
  await fetch(`${apiUrl}/storage/v1/object/normative-documents/${testPath}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
}

async function cleanTemporaryUsers() {
  const { body } = await request(`${apiUrl}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  for (const user of (body.users ?? []).filter((candidate) => typeof candidate.email === 'string' && candidate.email.startsWith(emailPrefix))) {
    const response = await fetch(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new Error('LOCAL_TEST_USER_CLEANUP_FAILED');
  }
}

(async () => {
  let result = 'FAIL';
  let detail = '';
  try {
    stage = 'signup';
    const signup = await request(`${apiUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: 'Local Document Security Regression' },
        options: { emailRedirectTo: 'http://localhost:3000/auth/callback?next=/auth/confirmed' },
      }),
    });
    const signupUser = signup.body.user ?? signup.body;
    if (!signupUser.id || signup.body.session?.access_token || signupUser.email_confirmed_at) {
      throw new Error('UNEXPECTED_SIGNUP_RESPONSE');
    }

    stage = 'confirmation-email';
    const confirmationMail = await waitForConfirmationEmail();
    const candidates = confirmationMail.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const confirmationUrl = candidates.find((candidate) => candidate.includes('/auth/v1/verify'))?.replace(/\\/g, '');
    if (!confirmationUrl) throw new Error('NO_CONFIRMATION_URL');

    stage = 'confirmation-request';
    const confirmationResponse = await fetch(confirmationUrl, { redirect: 'manual' });
    if (confirmationResponse.status < 300 || confirmationResponse.status > 399) {
      throw new Error(`CONFIRMATION_STATUS_${confirmationResponse.status}`);
    }

    stage = 'login';
    const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const accessToken = login.body.access_token;
    if (!accessToken) throw new Error('NO_ACCESS_TOKEN');

    stage = 'direct-table-access';
    const tableResponse = await fetch(`${apiUrl}/rest/v1/documents?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (tableResponse.ok) throw new Error('DIRECT_DOCUMENT_TABLE_ACCESS_ALLOWED');

    stage = 'direct-storage-upload';
    const storageResponse = await fetch(`${apiUrl}/storage/v1/object/normative-documents/${testPath}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'false',
      },
      body: Buffer.from('%PDF-1.4\n% local security regression\n'),
    });
    if (storageResponse.ok) {
      await deleteUnexpectedObject();
      throw new Error('DIRECT_DOCUMENT_STORAGE_UPLOAD_ALLOWED');
    }

    result = 'PASS';
  } catch (error) {
    detail = ` STAGE=${stage} CODE=${error.message}`;
  } finally {
    try {
      await cleanTemporaryUsers();
      console.log('LOCAL_TEST_USER_CLEANUP=PASS');
    } catch {
      console.log('LOCAL_TEST_USER_CLEANUP=FAIL');
      result = 'FAIL';
      detail = ' STAGE=cleanup';
    }
  }
  console.log(`LOCAL_DOCUMENT_SECURITY_REGRESSION=${result}${detail}`);
  if (result !== 'PASS') process.exitCode = 1;
})();
'@ | node -

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Remove-Item Env:AVEND_LOCAL_STATUS_BASE64 -ErrorAction SilentlyContinue
    Pop-Location
}
