/* Clawdius — MLB performance dashboard */

Chart.defaults.color = '#8b949e';
Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 12;

async function load(url) {
  try {
    const r = await fetch(url + '?t=' + Date.now());
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function el(id) { return document.getElementById(id); }

function fmt$(n) {
  const v = parseFloat(n) || 0;
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
}

function badge(result) {
  const r = (result || 'pending').toLowerCase();
  const map = { win: ['W', 'w'], loss: ['L', 'l'], push: ['P', 'p'], void: ['V', 'v'], pending: ['—', 'pending'] };
  const [label, cls] = map[r] || ['—', 'pending'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function pnlClass(v) {
  return v > 0 ? 'pos-cell' : v < 0 ? 'neg-cell' : 'neu-cell';
}

// ── Team name → 3-letter abbreviation ───────────────────────────────────────

const TEAM_ABBR = {
  'Arizona Diamondbacks': 'ARI', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CWS',
  'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET', 'Houston Astros': 'HOU', 'Kansas City Royals': 'KCR',
  'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM',
  'New York Yankees': 'NYY', 'Oakland Athletics': 'OAK', 'Athletics': 'OAK',
  'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SDP',
  'San Francisco Giants': 'SFG', 'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL',
  'Tampa Bay Rays': 'TBR', 'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR',
  'Washington Nationals': 'WSN',
};

function abbrevTeam(name) {
  return TEAM_ABBR[name.trim()] || name.trim().slice(0, 3).toUpperCase();
}

function abbrevGame(game) {
  if (!game || !game.includes('@')) return game || '—';
  const [away, home] = game.split('@').map(s => s.trim());
  return `${abbrevTeam(away)} @ ${abbrevTeam(home)}`;
}

function abbrevSelection(sel) {
  if (!sel || sel === '—') return sel || '—';
  // Totals: starts with o/u followed by a number (e.g. "o7.5", "u8.5")
  if (/^[ouOU]\d/.test(sel)) return sel;
  // Spreads: "Team Name +/-line" — team name followed by a signed number
  const spreadMatch = sel.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
  if (spreadMatch) return abbrevTeam(spreadMatch[1]) + ' ' + spreadMatch[2];
  // H2H / 1H ML: just a team name
  return abbrevTeam(sel);
}

// ── Summary strip ────────────────────────────────────────────────────────────

function renderSummary(s) {
  if (!s) return;
  const w = s.wins || 0, l = s.losses || 0, p = s.pushes || 0;
  el('record').textContent = `${w}–${l}${p > 0 ? `–${p}` : ''}`;

  const wr = parseFloat(s.win_rate) || 0;
  el('win-rate').textContent = (wr * 100).toFixed(1) + '%';

  const pnl = parseFloat(s.total_pnl) || 0;
  const pnlEl = el('pnl');
  pnlEl.textContent = fmt$(pnl);
  pnlEl.className = 'stat-value ' + (pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '');

  const roi = parseFloat(s.roi) || 0;
  const roiEl = el('roi');
  roiEl.textContent = (roi >= 0 ? '+' : '') + (roi * 100).toFixed(1) + '%';
  roiEl.className = 'stat-value ' + (roi > 0 ? 'pos' : roi < 0 ? 'neg' : '');

  el('total-bets').textContent = s.total_bets || 0;
  el('last-updated').textContent = s.last_updated ? `Updated ${s.last_updated}` : '';
}

// ── Cumulative P&L chart ─────────────────────────────────────────────────────

function renderPnlChart(ledger, summary) {
  const ctx = el('pnl-chart').getContext('2d');
  const settled = (ledger || []).filter(e => e.result && e.result !== 'pending');

  if (settled.length === 0) {
    new Chart(ctx, {
      type: 'bar',
      data: { labels: ['—'], datasets: [{ data: [0], backgroundColor: 'transparent' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'No settled bets yet', color: '#8b949e', padding: 60 } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
    return;
  }

  // Build running P&L series — start from the correction offset
  const correction = summary?.pnl_correction || 0;
  let running = correction;
  const labels = [], data = [], colors = [];
  for (const e of settled) {
    running += parseFloat(e.pnl) || 0;
    labels.push(e.date || '');
    data.push(parseFloat(running.toFixed(2)));
    colors.push(running >= 0 ? '#3fb950' : '#f85149');
  }

  // Add a zero reference line
  const zeroLine = labels.map(() => 0);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cumulative P&L',
          data,
          borderColor: data[data.length - 1] >= 0 ? '#3fb950' : '#f85149',
          backgroundColor: data[data.length - 1] >= 0
            ? 'rgba(63,185,80,0.08)'
            : 'rgba(248,81,73,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: data.length > 40 ? 0 : 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Break even',
          data: zeroLine,
          borderColor: 'rgba(139,148,158,0.35)',
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 10, padding: 16 } },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return ` ${v >= 0 ? '+' : ''}$${v.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(48,54,61,0.6)' }, ticks: { maxTicksLimit: 10 } },
        y: {
          grid: { color: 'rgba(48,54,61,0.6)' },
          ticks: { callback: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) }
        }
      }
    }
  });
}

// ── Bet history table ────────────────────────────────────────────────────────

function renderTable(ledger) {
  const tbody = el('bet-table-body');
  if (!ledger || !ledger.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No bets recorded yet.</td></tr>';
    return;
  }

  // Build rows newest-first with running P&L
  const settled = [...ledger].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let running = 0;
  const withRunning = settled.map(e => {
    if (e.result && e.result !== 'pending') running += parseFloat(e.pnl) || 0;
    return { ...e, _running: parseFloat(running.toFixed(2)) };
  });

  const rows = [...withRunning].reverse();
  tbody.innerHTML = rows.map(e => {
    const pnl = parseFloat(e.pnl) || 0;
    const run = e._running;
    const selStr = abbrevSelection(e.selection);
    const oddsVal = parseFloat(e.odds);
    const oddsStr = e.odds ? (oddsVal > 0 ? `+${oddsVal}` : `${oddsVal}`) : '—';
    const pnlStr = e.result === 'pending' ? '—' : fmt$(pnl);
    const runStr = e.result === 'pending' ? '—' : fmt$(run);
    return `<tr>
      <td>${e.date || '—'}</td>
      <td>${abbrevGame(e.game)}</td>
      <td>${e.bet_type || '—'}</td>
      <td>${(e.market || '—').toUpperCase()}</td>
      <td>${selStr}</td>
      <td>${oddsStr}</td>
      <td>${e.units || '—'}u</td>
      <td>$${parseFloat(e.stake_usd || 0).toFixed(2)}</td>
      <td>${badge(e.result)}</td>
      <td class="${pnlClass(pnl)}">${pnlStr}</td>
      <td class="${pnlClass(run)}">${runStr}</td>
    </tr>`;
  }).join('');
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  const [summary, ledger] = await Promise.all([
    load('data/summary.json'),
    load('data/ledger.json'),
  ]);
  renderSummary(summary);
  renderPnlChart(ledger, summary);
  renderTable(ledger);
}

document.addEventListener('DOMContentLoaded', init);
setInterval(init, 5 * 60 * 1000);
