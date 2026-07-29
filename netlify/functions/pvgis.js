// PVGIS proxy for the Solar Generation Calculator.
// PVGIS (https://re.jrc.ec.europa.eu) doesn't send CORS headers, so the browser
// can't call it directly — this tiny dependency-free function relays the request
// and returns a trimmed JSON payload. No npm deps (keep it that way: function
// bundling deps must live in root package.json — see project notes).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const lat = parseFloat(q.lat), lon = parseFloat(q.lon);
  const kwp = parseFloat(q.kwp);
  const angle = clamp(parseFloat(q.angle ?? '35') || 35, 0, 90);
  const aspect = clamp(parseFloat(q.aspect ?? '0') || 0, -180, 180);
  let loss = clamp(parseFloat(q.loss ?? '10') || 10, 0, 40);
  if (q.tech === 'old') loss = clamp(loss + 2, 0, 40); // older panels: worse temp coefficient

  const bad = (msg) => ({ statusCode: 400, headers: cors(), body: JSON.stringify({ error: msg }) });
  if (!isFinite(lat) || lat < 40 || lat > 65) return bad('lat out of range');
  if (!isFinite(lon) || lon < -12 || lon > 5) return bad('lon out of range');
  if (!isFinite(kwp) || kwp <= 0 || kwp > 200) return bad('kwp out of range');

  const qs =
    `lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&peakpower=${kwp.toFixed(3)}` +
    `&loss=${loss}&angle=${angle}&aspect=${aspect}` +
    `&pvtechchoice=crystSi&mountingplace=building&outputformat=json`;

  let lastErr = null;
  for (const ver of ['v5_3', 'v5_2']) {
    try {
      const res = await fetch(`https://re.jrc.ec.europa.eu/api/${ver}/PVcalc?${qs}`, {
        headers: { 'User-Agent': 'Decarbonarma solar calculator (decarbonarma.com)' },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) { lastErr = `PVGIS ${ver} HTTP ${res.status}`; continue; }
      const j = await res.json();
      const months = j?.outputs?.monthly?.fixed;
      const annual = j?.outputs?.totals?.fixed?.E_y;
      if (!Array.isArray(months) || months.length !== 12 || !isFinite(annual)) {
        lastErr = `PVGIS ${ver} unexpected shape`; continue;
      }
      const monthly = months
        .slice()
        .sort((a, b) => a.month - b.month)
        .map((m) => m.E_m);
      return {
        statusCode: 200,
        headers: {
          ...cors(),
          'Content-Type': 'application/json',
          // Long-term climate averages — cache aggressively at the CDN.
          'Cache-Control': 'public, max-age=86400',
          'Netlify-CDN-Cache-Control': 'public, durable, max-age=2592000',
        },
        body: JSON.stringify({
          annual,
          monthly,
          db: j?.inputs?.meteo_data?.radiation_db || 'PVGIS',
          api: ver,
          loss,
        }),
      };
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e);
    }
  }
  return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: 'PVGIS unreachable', detail: lastErr }) };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*' };
}
