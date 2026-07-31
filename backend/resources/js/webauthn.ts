/**
 * WebAuthn helpers for fingerprint enrollment and self-check.
 * Uses platform authenticators (Windows Hello, Touch ID, Linux fingerprint PAM, etc.).
 */

const bufferToBase64Url = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBuffer = (value: string): ArrayBuffer => {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const isWebAuthnAvailable = (): boolean => {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function';
};

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('gym_auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const tenantSlug = localStorage.getItem('tenant_slug');
  if (tenantSlug) {
    (headers as Record<string, string>)['X-Tenant-Slug'] = tenantSlug;
  }
  return headers;
};

const parseError = async (res: Response): Promise<string> => {
  try {
    const data = await res.json();
    return data.message || data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
};

export type FingerprintCredentialMeta = {
  id: string;
  device_name?: string | null;
  last_used_at?: string | null;
  created_at?: string;
};

export async function fetchMemberFingerprints(memberId: string): Promise<{
  credentials: FingerprintCredentialMeta[];
  has_fingerprint: boolean;
}> {
  const res = await fetch(`/api/members/${memberId}/fingerprints`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function enrollMemberFingerprint(memberId: string): Promise<void> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Fingerprint / WebAuthn is not available in this browser. Use Chrome/Edge/Firefox on a secure origin (HTTPS or localhost) with a fingerprint reader.');
  }

  const optionsRes = await fetch(`/api/members/${memberId}/fingerprints/register/options`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!optionsRes.ok) throw new Error(await parseError(optionsRes));
  const options = await optionsRes.json();

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    rp: options.rp,
    user: {
      id: base64UrlToBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation,
    excludeCredentials: (options.excludeCredentials || []).map((c: { id: string; type: string }) => ({
      type: 'public-key' as const,
      id: base64UrlToBuffer(c.id),
    })),
    authenticatorSelection: options.authenticatorSelection,
  };

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('Fingerprint enrollment cancelled or timed out.');
    }
    if (err?.name === 'InvalidStateError') {
      throw new Error('This fingerprint is already enrolled for another account on this device.');
    }
    if (err?.name === 'NotSupportedError') {
      throw new Error('No platform fingerprint authenticator found on this device.');
    }
    throw new Error(err?.message || 'Could not enroll fingerprint.');
  }

  if (!credential) {
    throw new Error('Fingerprint enrollment cancelled.');
  }

  const attestation = credential.response as AuthenticatorAttestationResponse;
  if (typeof attestation.getPublicKey !== 'function') {
    throw new Error('This browser cannot export the fingerprint public key. Please use a modern Chromium or Firefox browser.');
  }

  const publicKeySpki = attestation.getPublicKey();
  if (!publicKeySpki) {
    throw new Error('Authenticator did not return a public key. Try another browser or reader.');
  }

  const transports = typeof attestation.getTransports === 'function'
    ? attestation.getTransports()
    : [];

  const finishRes = await fetch(`/api/members/${memberId}/fingerprints/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: bufferToBase64Url(credential.rawId),
      publicKey: bufferToBase64Url(publicKeySpki),
      clientDataJSON: bufferToBase64Url(attestation.clientDataJSON),
      transports,
      deviceName: 'Fingerprint reader',
    }),
  });

  if (!finishRes.ok) throw new Error(await parseError(finishRes));
}

export async function removeMemberFingerprint(memberId: string, credentialId: string): Promise<void> {
  const res = await fetch(`/api/members/${memberId}/fingerprints/${credentialId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function authenticateWithFingerprint(memberId?: string): Promise<{
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  email?: string | null;
  phone?: string | null;
}> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Fingerprint / WebAuthn is not available in this browser.');
  }

  const optionsRes = await fetch('/api/fingerprint/authenticate/options', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(memberId ? { member_id: memberId } : {}),
  });
  if (!optionsRes.ok) throw new Error(await parseError(optionsRes));
  const options = await optionsRes.json();

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    timeout: options.timeout,
    rpId: options.rpId,
    userVerification: options.userVerification,
    allowCredentials: (options.allowCredentials || []).map((c: { id: string; type: string; transports?: string[] }) => ({
      type: 'public-key' as const,
      id: base64UrlToBuffer(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('Fingerprint check-in cancelled or timed out.');
    }
    if (err?.name === 'NotSupportedError') {
      throw new Error('No fingerprint reader available on this device.');
    }
    throw new Error(err?.message || 'Fingerprint authentication failed.');
  }

  if (!credential) {
    throw new Error('Fingerprint check-in cancelled.');
  }

  const assertion = credential.response as AuthenticatorAssertionResponse;
  const finishRes = await fetch('/api/fingerprint/authenticate', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: bufferToBase64Url(credential.rawId),
      clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.authenticatorData),
      signature: bufferToBase64Url(assertion.signature),
    }),
  });

  if (!finishRes.ok) throw new Error(await parseError(finishRes));
  const data = await finishRes.json();
  return data.member;
}
