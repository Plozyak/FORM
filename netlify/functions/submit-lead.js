const { randomUUID } = require('node:crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

// A 201 response means that the request was durably queued, not that email has arrived.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (Buffer.byteLength(event.body || '', 'utf8') > 16000) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Request too large' }) };
    }
    const incoming = JSON.parse(event.body || '{}');
    const email = String(incoming.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Zadejte prosím platnou e-mailovou adresu.' }) };
    }
    const keys = ['typPrace', 'pomoc', 'termin', 'rozsah', 'telefon', 'jmeno', 'kanal',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'odeslano'];
    const payload = { email };
    for (const key of keys) {
      if (typeof incoming[key] === 'string') payload[key] = incoming[key].slice(0, 500);
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    connectLambda(event);
    const store = getStore({ name: 'lead-inbox', consistency: 'strong' });
    await store.setJSON('lead-' + id, {
      id, createdAt, status: 'pending', attempts: 0, nextAttemptAt: createdAt, payload
    });
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, queued: true, id })
    };
  } catch (error) {
    console.error('Lead could not be saved:', error);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Poptávku se nepodařilo uložit. Zkuste to prosím znovu.' })
    };
  }
};
