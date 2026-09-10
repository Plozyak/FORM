const DEFAULT_LEGACY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdJ7idSSM2c9PqNtI-GFghdKJr4As6UCurQiEhKPKGpxwoxKVZTx2O_ikTbTmByWarzg/exec';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return;

  try {
    const payload = JSON.parse(event.body || '{}');
    const legacyEndpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL || DEFAULT_LEGACY_ENDPOINT;

    const response = await fetch(legacyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Legacy endpoint failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Background email delivery failed', error);
    throw error;
  }
};
