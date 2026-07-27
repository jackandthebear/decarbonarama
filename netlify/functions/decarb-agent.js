// Decarbonarma Home Energy Adviser — backend proxy to the Claude API.
// Keeps the API key server-side. Front-end: /home-energy-adviser.html
//
// SETUP (one-time): in Netlify -> Site settings -> Environment variables,
// add  ANTHROPIC_API_KEY = sk-ant-...   then redeploy. Nothing else needed.
//
// Model is a constant below so it's easy to swap (Haiku = cheapest).

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 900;
const MAX_USER_CHARS = 4000;      // cap per message to control cost
const MAX_HISTORY = 16;           // cap conversation length sent upstream

// --- Knowledge base: single source of truth is /agent/*.json ---
// esbuild bundles required JSON. Fall back to a distilled summary if the
// path can't be resolved in the build.
let BENCHMARKS = null, RULES = null, ARTICLES = null;
try { BENCHMARKS = require('../../agent/price-benchmarks.json'); } catch (e) {}
try { RULES = require('../../agent/g98-g99-rules.json'); } catch (e) {}
try { ARTICLES = require('../../agent/article-knowledge.json'); } catch (e) {}

const KB_FALLBACK = `
PRICE BENCHMARKS (UK, 0% VAT to 31 Mar 2027):
- Solar PV: ~£1,400-1,600/kW installed. Flag HIGH >£1,800/kW, CHEAP <£1,150/kW. By size: 4kW ~£5.5k, 6kW ~£8.5k, 10kW ~£13k.
- Battery: ~£500-900/kWh installed. Flag HIGH >£1,000/kWh. 5kWh ~£2.5-4k, 10kWh ~£4.2-6.5k.
- ASHP: £8k-14k before grant (avg £12.5k, 8kW). £7,500 BUS grant deducted at source. Net after grant often £500-£6.5k.
- EV charger 7kW: £800-1,200 fitted. Flag HIGH >£1,500 (outside London/SE).
GRID RULES (G98/G99/G100):
- G98 (fit & inform, install first then notify DNO within 28 days): single phase <=3.68kW (16A), three phase <=11.04kW.
- G99 (MUST be approved BEFORE connecting): anything above G98. DNO up to 45 working days.
- Single-phase practical ceiling ~16-17kW total inverter capacity; above that expect three-phase requirement.
- G100 export limiter caps export (within 5s) so you can install a big inverter with a low export cap.
- Inverter capacity != export capacity. Any INCREASE to an approved system needs a G99 variation first.
`;

function buildSystemPrompt(facts) {
  const kb = (BENCHMARKS && RULES)
    ? `PRICE BENCHMARKS (JSON):\n${JSON.stringify(BENCHMARKS)}\n\nGRID RULES (JSON):\n${JSON.stringify(RULES)}`
    : KB_FALLBACK;

  const factLines = facts && typeof facts === 'object'
    ? Object.entries(facts).filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')
    : '(none provided yet)';

  const articlesBlock = (ARTICLES && Array.isArray(ARTICLES.articles))
    ? ARTICLES.articles.map(a => `- ${a.title} — ${a.url}\n  ${a.summary}`).join('\n')
    : '(article knowledge unavailable)';

  return `You are the Decarbonarma Home Energy Adviser — a straight-talking UK home-decarbonisation guide for solar, batteries, EV chargers and heat pumps. You speak to homeowners the way someone who has actually installed all of this themselves would: warm, concrete, no jargon, no sales fluff.

WHAT THE VISITOR TOLD THE WIZARD:
${factLines}

YOUR KNOWLEDGE BASE (reason over this — do not invent numbers):
${kb}

DECARBONARMA ARTICLES — you are familiar with every article and guide on the site (summaries below). Draw on them to answer in depth, and when a question maps to one, point the reader to it with its exact URL (e.g. "there's a full write-up here: <url>"). Don't invent article content beyond these summaries:
${articlesBlock}

HOW TO BEHAVE:
- Be concise and direct. Plain English. UK context and £.
- When your answer relates to a published article or guide, mention it briefly and give its URL so they can read the full piece.
- QUOTE CHECKING: when given a quote, work out the £/kW or £/kWh and compare to the benchmark. State the typical range, say plainly whether it's typical / high / suspiciously cheap, and list 2-3 specific things to question. This is factual ("that's ~20% above the typical range"), never a personalised buy/don't-buy recommendation.
- GRID: when relevant, tell them exactly which application they need (G98 vs G99), and CRUCIALLY whether it must be approved BEFORE work starts. Always end grid answers with: "Confirm with your DNO before ordering equipment."
- Hand off to the site's own free tools when useful: Battery Sizing (/battery_sizing_tool.html), Heat-Loss Estimator (/heat-loss-estimator.html), Tariff Finder (/ai-tariff-finder.html), Grants Guide (/uk-grants-guide.html).
- If you're missing a fact you need, ask ONE short question.
- Never give personalised financial or investment advice. Prices are ballpark and dated ${BENCHMARKS ? BENCHMARKS._meta.compiled : '2026'}; the DNO/MCS installer has the final say.
- Keep replies short — a few sentences or a tight list. No walls of text.`;
}

// --- best-effort in-memory rate limit (per warm instance; not bulletproof) ---
const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 25;
  const arr = (HITS.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > max;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'not_configured',
      message: 'The adviser is not switched on yet — add ANTHROPIC_API_KEY in Netlify and redeploy.' }) };
  }

  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'rate_limited',
      message: "You're going a bit fast — give it a minute and try again." }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'bad_json' }) }; }

  const facts = payload.facts || {};
  let messages = Array.isArray(payload.messages) ? payload.messages : [];
  // sanitise + cap
  messages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) }));
  if (!messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'no_messages' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(facts),
        messages
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'upstream', status: res.status, detail: detail.slice(0, 400) }) };
    }
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('').trim();
    return { statusCode: 200, headers, body: JSON.stringify({ reply: text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'server', message: String(e).slice(0, 200) }) };
  }
};
