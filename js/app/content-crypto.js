/* ═══════════════════════════════════════════════════════════════════════
   CONTENT-CRYPTO.JS (v1.40) — opens encrypted question files from the CDN

   The CDN is fast but public. So the mirrored question files can be stored encrypted:
       { "enc": 1, "kid": "k1", "iv": "<base64, 12 bytes>", "ct": "<base64, AES-256-GCM ciphertext + tag>" }
   The key is NOT on the CDN. The backend (action getContentKey) gives it only to a signed-in student with paid or trial
   access, the same check getFile uses. The file id is bound into the ciphertext as authenticated data, so a file cannot
   be swapped for another one. Plain (unencrypted) files still work, so this can be switched on file by file.

   The key is requested at most once per page load, held only in memory as a non-extractable CryptoKey, and never
   written to storage. Files saved for offline use are stored decrypted in the app's own database, exactly as before,
   so offline study needs no key. If anything here fails (no network, no access, wrong key), the caller falls back to
   Apps Script, which gives the file or the proper "payment needed" message.
   ═══════════════════════════════════════════════════════════════════════ */
const CONTENT_CRYPTO = {
  _keys: new Map(),            /* key id -> Promise<CryptoKey> (one request, shared by every file that needs it) */

  isEnvelope(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x) && x.enc === 1 &&
      typeof x.iv === 'string' && typeof x.ct === 'string' && typeof x.kid === 'string';
  },

  _b64(s) {
    const bin = atob(String(s));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  async _fetchKey(kid) {
    const auth = { username: (S.user && S.user.username) || '', token: (S.user && S.user.token) || '' };
    const r = await netFetch(`${APPS}?${qs({ action: 'getContentKey', kid, ...auth })}`, { redirect: 'follow' }, 15000);
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (e) { throw new Error('The key server sent something unreadable.'); }
    if (data && data.sessionInvalid) throw new Error('Your session expired. Sign out and sign in again to keep studying.');
    if (data && data.needsPayment) throw new Error('Your access has ended. Complete the payment to open new chapters.');
    if (!data || data.success !== true || typeof data.key !== 'string') throw new Error((data && data.error) || 'No content key available.');
    const raw = CONTENT_CRYPTO._b64(data.key);
    if (raw.length !== 32) throw new Error('The content key has the wrong length.');
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  },

  _key(kid) {
    if (!CONTENT_CRYPTO._keys.has(kid)) {
      const p = CONTENT_CRYPTO._fetchKey(kid);
      p.catch(() => CONTENT_CRYPTO._keys.delete(kid));      /* a failed request is not remembered */
      CONTENT_CRYPTO._keys.set(kid, p);
    }
    return CONTENT_CRYPTO._keys.get(kid);
  },

  /* Decrypt one envelope for the given file id. Returns the parsed JSON (the question list). */
  async open(env, fileId) {
    const decrypt = async () => {
      const key = await CONTENT_CRYPTO._key(env.kid);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: CONTENT_CRYPTO._b64(env.iv), additionalData: new TextEncoder().encode(String(fileId)) },
        key, CONTENT_CRYPTO._b64(env.ct));
      return JSON.parse(new TextDecoder().decode(plain));
    };
    try { return await decrypt(); }
    catch (e) {
      /* the key may have been replaced on the server under the same id: ask once more, then give up */
      if (e && e.name === 'OperationError') { CONTENT_CRYPTO._keys.delete(env.kid); return await decrypt(); }
      throw e;
    }
  },

  /* forget the key (used when a different student signs in) */
  clear() { CONTENT_CRYPTO._keys.clear(); }
};
