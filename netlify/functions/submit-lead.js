const DEFAULT_EMAIL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdJ7idSSM2c9PqNtI-GFghdKJr4As6UCurQiEhKPKGpxwoxKVZTx2O_ikTbTmByWarzg/exec';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const email = String(payload.email || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Zadejte prosím platnou e-mailovou adresu.' }),
      };
    }

    payload.email = email;
    const endpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL || DEFAULT_EMAIL_ENDPOINT;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      throw new Error('Email endpoint returned HTTP ' + response.status);
    }
    if (contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(responseText)) {
      throw new Error('Email endpoint returned HTML instead of a success response');
    }
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      result = responseText.trim();
    }
    if (result === false || (result && typeof result === 'object' && (result.ok === false || result.success === false || result.error))) {
      throw new Error('Email endpoint reported an error');
    }
    if (!result || (typeof result === 'string' && /^(error|failed|failure)/i.test(result))) {
      throw new Error('Email endpoint did not confirm receipt');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error('Lead email submission failed:', error);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Odeslání se nezdařilo. Zkuste to prosím znovu.' }),
    };
  }
};
