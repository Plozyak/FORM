const CRM_ENDPOINT = 'https://bbljqovydkexsptxwfrx.supabase.co/functions/v1/website-lead';
const DEFAULT_LEGACY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdJ7idSSM2c9PqNtI-GFghdKJr4As6UCurQiEhKPKGpxwoxKVZTx2O_ikTbTmByWarzg/exec';
const DELIVERY_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options, timeoutMs = DELIVERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const legacyEndpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL || DEFAULT_LEGACY_ENDPOINT;

    // Deliver to both destinations in parallel, but never let one slow endpoint
    // hold the browser open indefinitely. A lead is considered delivered when
    // at least one destination accepts it.
    const [legacyResult, crmResult] = await Promise.allSettled([
      fetchWithTimeout(legacyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(async r => {
        if (!r.ok) throw new Error(`Legacy endpoint failed: ${r.status}`);
        return true;
      }),
      fetchWithTimeout(CRM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://ddpoptavka.netlify.app'
        },
        body: JSON.stringify(payload)
      }).then(async r => {
        if (!r.ok) throw new Error(`CRM endpoint failed: ${r.status} ${await r.text()}`);
        try { return await r.json(); } catch (_) { return {}; }
      })
    ]);

    if (legacyResult.status === 'rejected') {
      console.error('Email / legacy delivery failed', legacyResult.reason);
    }
    if (crmResult.status === 'rejected') {
      console.error('CRM sync failed', crmResult.reason);
    }

    if (legacyResult.status === 'rejected' && crmResult.status === 'rejected') {
      throw new Error('Lead could not be delivered');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        email_delivery: legacyResult.status === 'fulfilled',
        crm_sync: crmResult.status === 'fulfilled'
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Unknown error' })
    };
  }
};
