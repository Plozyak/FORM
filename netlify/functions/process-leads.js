const { getStore, connectLambda } = require('@netlify/blobs');

const DEFAULT_EMAIL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdJ7idSSM2c9PqNtI-GFghdKJr4As6UCurQiEhKPKGpxwoxKVZTx2O_ikTbTmByWarzg/exec';
const RETRY_MINUTES = [1, 3, 10, 30, 60, 180, 360];
const MAX_PER_RUN = 2;

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore({ name: 'lead-inbox', consistency: 'strong' });
  const now = Date.now();
  let processed = 0;
  try {
    const { blobs } = await store.list();
    // Keep each run below the 30-second scheduled function execution limit.
    for (const { key } of blobs) {
      if (processed >= MAX_PER_RUN) break;
      const lead = await store.get(key, { type: 'json', consistency: 'strong' });
      if (!lead) continue;
      if (lead.status === 'sent') {
        if (Date.parse(lead.sentAt || lead.createdAt) < now - 30 * 86400000) {
          await store.delete(key);
        }
        continue;
      }
      if (lead.status === 'failed' && Date.parse(lead.createdAt) < now - 90 * 86400000) {
        // Preserve for manual recovery; never silently delete undelivered leads.
        continue;
      }
      if (lead.status !== 'pending' || Date.parse(lead.nextAttemptAt || lead.createdAt) > now) continue;

      // Mark before sending. Only one scheduled worker runs per minute.
      // Note that a timeout after the email was accepted can still cause a duplicate attempt.
      lead.status = 'processing';
      lead.attempts = (lead.attempts || 0) + 1;
      lead.processingAt = new Date().toISOString();
      await store.setJSON(key, lead);
      processed++;

      try {
        const endpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL || DEFAULT_EMAIL_ENDPOINT;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ ...lead.payload, submissionId: lead.id }),
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
        });
        const responseText = await response.text();
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(responseText)) {
          throw new Error('Email endpoint invalid response: HTTP ' + response.status);
        }
        let result;
        try { result = JSON.parse(responseText); } catch (_) { result = responseText.trim(); }
        if (!result || result === false ||
            (typeof result === 'object' && (result.ok === false || result.success === false || result.error)) ||
            (typeof result === 'string' && /^(error|failed|failure)/i.test(result))) {
          throw new Error('Email endpoint did not confirm receipt');
        }
        lead.status = 'sent';
        lead.sentAt = new Date().toISOString();
        delete lead.payload; // Minimize stored personal data once delivery succeeds.
        delete lead.processingAt;
        await store.setJSON(key, lead);
        console.log('Lead email confirmed:', lead.id);
      } catch (err) {
        lead.status = 'pending';
        lead.lastError = String(err.message || err).slice(0, 180);
        lead.nextAttemptAt = new Date(Date.now() + RETRY_MINUTES[Math.min(lead.attempts - 1, RETRY_MINUTES.length - 1)] * 60000).toISOString();
        delete lead.processingAt;
        await store.setJSON(key, lead);
        console.error('Lead email retry queued:', lead.id, lead.lastError);
      }
    }
    // Recover jobs interrupted by a cold start or unexpected function termination.
    for (const { key } of blobs) {
      const lead = await store.get(key, { type: 'json', consistency: 'strong' });
      if (lead?.status === 'processing' && Date.parse(lead.processingAt) < Date.now() - 3 * 60000) {
        lead.status = 'pending';
        lead.nextAttemptAt = new Date().toISOString();
        await store.setJSON(key, lead);
        console.warn('Recovered interrupted lead:', lead.id);
      }
    }
  } catch (err) {
    console.error('Lead email queue worker failed:', err);
    throw err;
  }
  return { statusCode: 200, body: JSON.stringify({ processed }) };
};
