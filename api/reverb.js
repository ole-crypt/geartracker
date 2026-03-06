export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const perPage = url.searchParams.get('per_page') || '25';
  const page = url.searchParams.get('page') || '1';
  const condition = url.searchParams.get('condition') || '';

  if (!q) {
    return new Response(
      JSON.stringify({ error: 'Missing search query (?q=)' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const token = process.env.REVERB_API_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'REVERB_API_TOKEN not configured' }),
      { status: 500, headers: corsHeaders }
    );
  }

  const sort = url.searchParams.get('sort') || '';
  const category = url.searchParams.get('category') || '';

  const reverbUrl = new URL('https://api.reverb.com/api/listings/all');
  reverbUrl.searchParams.set('query', q);
  reverbUrl.searchParams.set('per_page', perPage);
  reverbUrl.searchParams.set('page', page);
  if (sort) reverbUrl.searchParams.set('sort', sort);
  if (condition) reverbUrl.searchParams.set('conditions', condition);
  if (category) reverbUrl.searchParams.set('category', category);

  try {
    const res = await fetch(reverbUrl.toString(), {
      headers: {
        'Accept': 'application/hal+json',
        'Accept-Version': '3.0',
        'X-Auth-Token': token,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Reverb API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const listings = (data.listings || []).map(l => ({
      id: l.id,
      title: l.title,
      make: l.make || '',
      model: l.model || '',
      price: l.price ? parseFloat(l.price.amount) : 0,
      currency: l.price?.currency || 'USD',
      condition: l.condition?.display_name || '',
      link: l._links?.web?.href || '',
      photo: l.photos?.[0]?._links?.small_crop?.href || '',
      year: l.year || '',
    }));

    // Compute price stats
    const prices = listings.map(l => l.price).filter(p => p > 0);
    const stats = prices.length > 0 ? {
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      low: Math.min(...prices),
      high: Math.max(...prices),
      count: prices.length,
    } : null;

    return new Response(JSON.stringify({
      listings,
      stats,
      total: data.total || 0,
      page: data.current_page || 1,
    }), { headers: corsHeaders });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 502, headers: corsHeaders }
    );
  }
}
