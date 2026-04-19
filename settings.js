// ================= SETTINGS APP =================

function _card(inner)     { return `<div style="background:white;border-radius:10px;border:0.5px solid #d0d0d0;margin-bottom:4px;overflow:hidden;">${inner}</div>`; }
function _row(l, r, last) { return `<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 15px;${last?'':'border-bottom:0.5px solid #e8e8e8;'}">${l}${r}</div>`; }
function _lbl(t)          { return `<div style="font-size:10px;color:#8e8e93;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;margin-top:14px;">${t}</div>`; }
function _rl(t)           { return `<div style="font-size:13px;color:#1c1c1e;">${t}</div>`; }
function _rs(t)           { return `<div style="font-size:11px;color:#8e8e93;margin-top:2px;">${t}</div>`; }
function _rv(t)           { return `<div style="font-size:13px;color:#8e8e93;">${t}</div>`; }
function _title(t)        { return `<div style="font-size:21px;font-weight:500;color:#1c1c1e;margin-bottom:18px;">${t}</div>`; }
function _toggle(on) {
  return `<div onclick="settingsToggle(this)" data-on="${on?'1':'0'}" style="width:38px;height:22px;border-radius:11px;background:${on?'#30d158':'#d1d1d6'};position:relative;cursor:pointer;flex-shrink:0;transition:background 0.2s;"><span style="position:absolute;width:18px;height:18px;background:white;border-radius:50%;top:2px;left:${on?'18px':'2px'};transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:block;"></span></div>`;
}
function _chips(opts, sel, group) {
  return `<div style="display:flex;gap:6px;">${opts.map(o=>`<div onclick="settingsChip(this)" data-group="${group}" style="padding:4px 12px;border-radius:20px;font-size:12px;cursor:pointer;border:0.5px solid ${o===sel?'#0a84ff':'#c0c0c0'};background:${o===sel?'#0a84ff':'white'};color:${o===sel?'white':'#555'};">${o}</div>`).join('')}</div>`;
}

const SETTINGS_PANELS = {
 profile() {
    const user  = window._auth?.currentUser;
    const name  = user?.displayName || 'Guest';
    const email = user?.email || '—';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:22px;">
<img src="cat.jpg" style="width:72px;height:72px;border-radius:12px;border:2px solid rgba(0,0,0,0.12);margin-bottom:12px;"/>
        <div style="font-size:19px;font-weight:500;color:#1c1c1e;">${name}</div>
        <div style="font-size:12px;color:#8e8e93;margin-top:3px;">MacBook Account</div>
        <div style="font-size:12px;color:#aaa;margin-top:2px;">${email}</div>
      </div>
      ${_lbl('Account')}
      ${_card(_row(_rl('Username'),_rv('johndoe'))+_row(_rl('Email'),_rv(email))+_row(_rl('Password'),_rv('••••••••'),true))}
      ${_lbl('Game Stats')}
      ${_card(_row(_rl('Games played'),_rv('—'))+_row(_rl('Best score'),`<div style="font-size:13px;color:#c8930a;">— ⭐</div>`)+_row(_rl('Scams caught'),`<div style="font-size:13px;color:#1a8a3a;">—</div>`,true))}
      <div style="margin-top:16px;"><button onclick="settingsSignOut()" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,59,48,0.08);border:0.5px solid rgba(255,59,48,0.3);color:#ff3b30;font-size:13px;cursor:pointer;">Sign Out</button></div>`;
  },
  wifi() {
    return `${_title('Wi-Fi')}
      ${_card(_row(_rl('Wi-Fi'),_toggle(true),true))}
      ${_lbl('My Networks')}
      ${_card(_row(`<div>${_rl('HomeNetwork_5G')}${_rs('Connected — WPA2')}</div>`,`<span style="color:#1a8a3a;font-size:11px;">✓</span>`,true))}
      ${_lbl('Other Networks')}
      ${_card(_row(_rl('Xfinity_Guest'),`<span style="color:#c0c0c0;">›</span>`)+_row(_rl('TP-Link_4821'),`<span style="color:#c0c0c0;">›</span>`)+_row(_rl('FBI Surveillance Van'),`<span style="color:#c0c0c0;">›</span>`,true))}
      ${_lbl('Options')}
      ${_card(_row(_rl('Ask to join networks'),_toggle(true))+_row(_rl('Auto-join hotspots'),_toggle(false),true))}`;
  },
  bluetooth() {
    return `${_title('Bluetooth')}
      ${_card(_row(_rl('Bluetooth'),_toggle(true),true))}
      ${_lbl('My Devices')}
      ${_card(_row(`<div>${_rl('AirPods Pro')}${_rs('Connected')}</div>`,`<span style="color:#c0c0c0;">›</span>`)+_row(`<div>${_rl('Magic Mouse')}${_rs('Connected')}</div>`,`<span style="color:#c0c0c0;">›</span>`,true))}
      ${_lbl('Nearby Devices')}
      ${_card(_row(_rl('Samsung Galaxy Buds'),`<span style="font-size:12px;color:#0a84ff;cursor:pointer;">Pair</span>`)+_row(_rl('Unknown Device'),`<span style="font-size:12px;color:#0a84ff;cursor:pointer;">Pair</span>`,true))}`;
  },
  network() {
    return `${_title('Network')}
      ${_card(_row(_rl('IP Address'),_rv('192.168.1.42'))+_row(_rl('Subnet Mask'),_rv('255.255.255.0'))+_row(_rl('Router'),_rv('192.168.1.1'))+_row(_rl('DNS'),_rv('8.8.8.8'),true))}
      ${_lbl('Status')}
      ${_card(_row(_rl('Connection'),`<div style="font-size:13px;color:#1a8a3a;">Active</div>`)+_row(_rl('Speed'),_rv('↑ 12 Mbps  ↓ 84 Mbps'),true))}`;
  },
  vpn() {
    return `${_title('VPN')}
      ${_card(_row(`<div>${_rl('VPN')}${_rs('Not connected')}</div>`,_toggle(false),true))}
      ${_lbl('Configurations')}
      ${_card(_row(_rl('Add VPN Configuration...'),`<span style="font-size:16px;color:#0a84ff;cursor:pointer;">+</span>`,true))}
      ${_lbl('Options')}
      ${_card(_row(_rl('Connect on demand'),_toggle(false),true))}`;
  },
  hotspot() {
    return `${_title('Personal Hotspot')}
      ${_card(_row(_rl('Allow others to join'),_toggle(false),true))}
      ${_lbl('Wi-Fi Password')}
      ${_card(_row(_rl('Password'),_rv('••••••••'),true))}
      ${_lbl('Connected Devices')}
      ${_card(`<div style="padding:11px 15px;color:#aaa;font-size:13px;text-align:center;">No devices connected</div>`)}`;
  },
  battery() {
    return `${_title('Battery')}
      <div style="display:flex;align-items:center;gap:14px;background:white;border-radius:10px;border:0.5px solid #d0d0d0;padding:14px 16px;margin-bottom:14px;">
        <div style="font-size:32px;">🔋</div>
        <div><div style="font-size:22px;font-weight:500;color:#1c1c1e;">87%</div><div style="font-size:12px;color:#8e8e93;">Charging — full in 1h 12m</div></div>
      </div>
      ${_lbl('Options')}
      ${_card(_row(_rl('Low power mode'),_toggle(false))+_row(_rl('Optimized charging'),_toggle(true))+_row(_rl('Turn display off after'),_rv('5 min'),true))}
      ${_lbl('Battery Health')}
      ${_card(_row(_rl('Maximum capacity'),`<div style="font-size:13px;color:#1a8a3a;">96%</div>`)+_row(_rl('Condition'),`<div style="font-size:13px;color:#1a8a3a;">Normal</div>`,true))}`;
  },
  wallpaper() {
    const thumbs = [1,2,3,4,5,6].map((n,i)=>`<div onclick="settingsPickWallpaper(this)" style="border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid ${i===0?'#0a84ff':'transparent'};aspect-ratio:16/9;"><img src="https://picsum.photos/200/112?random=${n+10}" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`).join('');
    return `${_title('Wallpaper')}
      <div id="wallpaper-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">${thumbs}</div>
      ${_lbl('Options')}
      ${_card(_row(_rl('Show on all Spaces'),_toggle(true))+_row(`<div>${_rl('Auto-rotate')}${_rs('Changes every hour')}</div>`,_toggle(false),true))}`;
  },
  appearance() {
    const colors = ['#0a84ff','#30d158','#ff453a','#ff9f0a','#bf5af2','#636366'];
    return `${_title('Appearance')}
      ${_lbl('Mode')}
      ${_card(_row(_rl('Theme'),_chips(['Dark','Light','Auto'],'Dark','mode'),true))}
      ${_lbl('Accent Color')}
      ${_card(_row(_rl('Color'),`<div style="display:flex;gap:7px;">${colors.map((c,i)=>`<div onclick="settingsPickColor(this)" style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${i===0?'#1c1c1e':'transparent'};flex-shrink:0;"></div>`).join('')}</div>`,true))}
      ${_lbl('Display')}
      ${_card(_row(`<div>${_rl('Reduce motion')}${_rs('Limits animations')}</div>`,_toggle(false))+_row(_rl('Transparency'),_toggle(true),true))}`;
  },
  notifications() {
    return `${_title('Notifications')}
      ${_card(_row(`<div>${_rl('Allow notifications')}${_rs('Show alerts during gameplay')}</div>`,_toggle(true))+_row(_rl('Sound effects'),_toggle(true),true))}
      ${_lbl('Alert Style')}
      ${_card(_row(_rl('Style'),_chips(['Banner','Alert','None'],'Banner','alert'),true))}
      ${_lbl('Game Events')}
      ${_card(_row(_rl('Scam detected'),_toggle(true))+_row(_rl('Heart lost'),_toggle(true))+_row(_rl('Round complete'),_toggle(false),true))}`;
      
  },
  async leaderboard() {
  const snapshot = await getDocs(query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10)));
  const rows = snapshot.docs.map((d, i) => {
    const { name, score } = d.data();
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    return _row(`<div style="font-size:13px;color:#1c1c1e;">${medal} ${name}</div>`, `<div style="font-size:13px;color:#ffd60a;font-weight:600;">⭐ ${score}</div>`, i === snapshot.docs.length - 1);
  }).join('');
  return `${_title('Leaderboard')}${_card(rows || '<div style="padding:14px;color:#aaa;text-align:center;font-size:13px;">No scores yet</div>')}`;
}
};

// ── public API ──

window.settingsShowPanel = function(name, navEl, pillEl) {
  document.querySelectorAll('.settings-nav-item').forEach(el => {
    el.style.background = 'transparent';
    el.style.color = '#1c1c1e';
  });
  if (navEl) { navEl.style.background = '#0a84ff'; navEl.style.color = 'white'; }
  if (pillEl) { pillEl.style.background = 'rgba(0,0,0,0.07)'; }

  const panel = document.getElementById('settings-panel');
  if (!panel || !SETTINGS_PANELS[name]) return;

  const result = SETTINGS_PANELS[name]();
  if (result instanceof Promise) {
    panel.innerHTML = '<div style="padding:30px;text-align:center;color:#aaa;font-size:13px;">Loading...</div>';
    result.then(html => panel.innerHTML = html);
  } else {
    panel.innerHTML = result;
  }
};

window.settingsFilter = function(q) {
  const query = q.trim().toLowerCase();
  document.querySelectorAll('.settings-nav-item').forEach(el => {
    el.style.display = (!query || el.getAttribute('data-label').toLowerCase().includes(query)) ? '' : 'none';
  });
  document.querySelectorAll('.settings-group-header').forEach(h => {
    let sib = h.nextElementSibling;
    let any = false;
    while (sib && !sib.classList.contains('settings-group-header')) {
      if (sib.style.display !== 'none') any = true;
      sib = sib.nextElementSibling;
    }
    h.style.display = any ? '' : 'none';
  });
  const visible = [...document.querySelectorAll('.settings-nav-item')].filter(el => el.style.display !== 'none');
  if (visible.length === 1) {
    const m = visible[0].getAttribute('onclick').match(/settingsShowPanel\('(\w+)'/);
    if (m) settingsShowPanel(m[1], visible[0]);
  }
};

window.settingsToggle = function(el) {
  const nowOn = el.getAttribute('data-on') !== '1';
  el.setAttribute('data-on', nowOn ? '1' : '0');
  el.style.background = nowOn ? '#30d158' : '#d1d1d6';
  const thumb = el.querySelector('span');
  if (thumb) thumb.style.left = nowOn ? '18px' : '2px';
};

window.settingsChip = function(el) {
  const group = el.getAttribute('data-group');
  document.querySelectorAll(`[data-group="${group}"]`).forEach(c => {
    c.style.background = 'white'; c.style.color = '#555'; c.style.borderColor = '#c0c0c0';
  });
  el.style.background = '#0a84ff'; el.style.color = 'white'; el.style.borderColor = '#0a84ff';
};

window.settingsPickColor = function(el) {
  el.parentElement.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
  el.style.borderColor = '#1c1c1e';
};

window.settingsPickWallpaper = function(el) {
  const grid = document.getElementById('wallpaper-grid');
  if (grid) grid.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
  el.style.borderColor = '#0a84ff';
};

window.settingsSignOut = function() {
  location.reload();
};

// ── auto-init when settings window is opened ──
// Works by observing class changes on the window div
window.addEventListener('DOMContentLoaded', function() {
  const win = document.getElementById('window-settings');
  if (!win) return;
  const observer = new MutationObserver(function() {
    if (!win.classList.contains('hidden')) {
      const pill = document.getElementById('settings-pill-profile');
      settingsShowPanel('profile', null, pill);
    }
  });
  observer.observe(win, { attributes: true, attributeFilter: ['class'] });
});