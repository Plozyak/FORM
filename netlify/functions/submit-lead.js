const CRM_ENDPOINT = 'https://bbljqovydkexsptxwfrx.supabase.co/functions/v1/website-lead';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const email = String(payload.email || '').trim();

    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Vyplňte prosím e-mailovou adresu.' })
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Zadejte prosím platnou e-mailovou adresu.' })
      };
    }

    payload.email = email;

    const response = await fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ddpoptavka.netlify.app'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`CRM endpoint failed: ${response.status} ${await response.text()}`);
    }

    let crm = {};
    try { crm = await response.json(); } catch (_) {}

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, crm_sync: true, crm })
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
