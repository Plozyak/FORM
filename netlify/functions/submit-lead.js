const CRM_ENDPOINT = 'https://bbljqovydkexsptxwfrx.supabase.co/functions/v1/website-lead';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const legacyEndpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL;

    const crmResponse = await fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ddpoptavka.netlify.app'
      },
      body: JSON.stringify(payload)
    });

    if (!crmResponse.ok) {
      const text = await crmResponse.text();
      throw new Error(`CRM endpoint failed: ${crmResponse.status} ${text}`);
    }

    let crmResult = {};
    try { crmResult = await crmResponse.json(); } catch (_) {}

    if (legacyEndpoint) {
      try {
        await fetch(legacyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch (legacyError) {
        console.error('Legacy forwarding failed', legacyError);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, ...crmResult })
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
