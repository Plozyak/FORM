const CRM_ENDPOINT = 'https://bbljqovydkexsptxwfrx.supabase.co/functions/v1/website-lead';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    // Start the email delivery as a Netlify Background Function.
    // Netlify acknowledges background invocation with 202 immediately,
    // so the visitor does not wait for Google Apps Script/email delivery.
    const siteUrl = process.env.URL || 'https://ddpoptavka.netlify.app';
    const emailJob = fetch(`${siteUrl}/.netlify/functions/send-email-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => {
      if (!r.ok) throw new Error(`Email background invocation failed: ${r.status}`);
      return true;
    });

    // CRM is the synchronous source of truth for a successful lead.
    const crmJob = fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ddpoptavka.netlify.app'
      },
      body: JSON.stringify(payload)
    }).then(async r => {
      if (!r.ok) throw new Error(`CRM endpoint failed: ${r.status} ${await r.text()}`);
      try { return await r.json(); } catch (_) { return {}; }
    });

    const [emailResult, crmResult] = await Promise.allSettled([emailJob, crmJob]);

    if (emailResult.status === 'rejected') {
      console.error('Email background invocation failed', emailResult.reason);
    }

    if (crmResult.status === 'rejected') {
      console.error('CRM sync failed', crmResult.reason);
      throw new Error('Lead could not be saved');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        crm_sync: true,
        email_queued: emailResult.status === 'fulfilled'
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
