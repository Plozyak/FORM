const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ownerId = process.env.CRM_OWNER_USER_ID;
    const legacyEndpoint = process.env.LEGACY_GOOGLE_APPS_SCRIPT_URL;

    if (!supabaseUrl || !serviceRoleKey || !ownerId) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const email = (payload.email || '').trim() || null;
    const phone = (payload.telefon || '').trim() || null;
    const fullName = (payload.jmeno || '').trim() || null;

    let client = null;
    if (email) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('owner_id', ownerId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      client = data || null;
    }
    if (!client && phone) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();
      client = data || null;
    }

    if (!client) {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          owner_id: ownerId,
          full_name: fullName,
          email,
          phone,
          preferred_channel: payload.kanal || null,
          source: 'website-form'
        })
        .select('*')
        .single();
      if (error) throw error;
      client = data;
    } else {
      const updates = {};
      if (fullName && !client.full_name) updates.full_name = fullName;
      if (email && !client.email) updates.email = email;
      if (phone && !client.phone) updates.phone = phone;
      if (payload.kanal) updates.preferred_channel = payload.kanal;
      if (Object.keys(updates).length) {
        await supabase.from('clients').update(updates).eq('id', client.id);
      }
    }

    const headers = event.headers || {};
    const referrer = headers.referer || headers.referrer || null;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        owner_id: ownerId,
        client_id: client.id,
        stage: 'ЛІД',
        status: 'Активний',
        work_type: payload.typPrace || null,
        help_type: payload.pomoc || null,
        pages_text: payload.rozsah || null,
        deadline_text: payload.termin || null,
        source: 'website-form',
        source_url: referrer,
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        utm_content: payload.utm_content || null,
        utm_term: payload.utm_term || null,
        custom_fields: {
          preferred_channel: payload.kanal || null,
          original_submission: payload
        }
      })
      .select('*')
      .single();
    if (orderError) throw orderError;

    const messageBody = [
      payload.typPrace && `Typ práce: ${payload.typPrace}`,
      payload.pomoc && `Typ pomoci: ${payload.pomoc}`,
      payload.termin && `Termín: ${payload.termin}`,
      payload.rozsah && `Rozsah: ${payload.rozsah}`,
      payload.kanal && `Preferovaný kanál: ${payload.kanal}`
    ].filter(Boolean).join('\n');

    await supabase.from('messages').insert({
      owner_id: ownerId,
      client_id: client.id,
      order_id: order.id,
      channel: 'website-form',
      direction: 'in',
      sender: email || phone || fullName || 'Website lead',
      recipient: 'DiplomovaDilna CRM',
      subject: 'Nová poptávka z webu',
      body: messageBody,
      metadata: payload,
      occurred_at: payload.odeslano || new Date().toISOString()
    });

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
      body: JSON.stringify({ ok: true, client_id: client.id, order_id: order.id })
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
