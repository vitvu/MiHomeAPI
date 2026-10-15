/* MiHome API — animated device illustrations (inline SVG).
 * VIS.create(kind) returns an <div> element; VIS.update(el, state) animates it in place
 * without re-creating the SVG, so animations stay smooth across refreshes.
 * state = { on, speed (0..1), color, pm, brightness (0..1), ct (0..1 warm->cold), level (0..1) }
 */
(function () {
  const KINDS = {
    'air-purifier': 'purifier', 'air-fresh': 'purifier', 'fan': 'fan', 'air-fan': 'fan', 'tower-fan': 'fan',
    'humidifier': 'humidifier', 'dehumidifier': 'humidifier', 'light': 'light', 'lamp': 'light', 'ceiling-light': 'light',
    'outlet': 'plug', 'switch': 'plug', 'plug': 'plug', 'vacuum': 'vacuum', 'robot-cleaner': 'vacuum',
  };
  const kind = c => KINDS[c] || (/(light|lamp|bulb)/.test(c) ? 'light' : /(purifier|fresh)/.test(c) ? 'purifier'
    : /fan/.test(c) ? 'fan' : /(outlet|plug|switch)/.test(c) ? 'plug' : /(vacuum|sweep|clean)/.test(c) ? 'vacuum'
    : /humid/.test(c) ? 'humidifier' : 'generic');

  const defs = id => `<defs>
    <linearGradient id="${id}b" x1="0" x2="1"><stop offset="0" stop-color="var(--dev-sh)"/><stop offset=".22" stop-color="var(--dev)"/><stop offset=".7" stop-color="var(--dev)"/><stop offset="1" stop-color="var(--dev-sh)"/></linearGradient>
    <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--dev-hi)"/><stop offset="1" stop-color="var(--dev)"/></linearGradient>
    <pattern id="${id}m" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.35" fill="var(--dev-hole)"/></pattern>
    <radialGradient id="${id}g"><stop offset="0" stop-color="var(--glow)" stop-opacity=".9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <filter id="${id}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`;

  const blades = (n, r, w) => Array.from({ length: n }, (_, i) =>
    `<path d="M0 0 C ${w} ${-r * .35}, ${w * .6} ${-r * .95}, 0 ${-r} C ${-w * .5} ${-r * .8}, ${-w * .4} ${-r * .3}, 0 0Z" transform="rotate(${i * 360 / n})" fill="var(--blade)"/>`).join('');

  const flows = (x0, y0, w, n) => Array.from({ length: n }, (_, i) => {
    const x = x0 + (w / (n - 1)) * i;
    return `<path class="v-flow" style="animation-delay:${(-i * 0.37).toFixed(2)}s" d="M${x} ${y0} q 8 -14 0 -28 q -8 -14 0 -28 q 8 -14 0 -28" fill="none" stroke="var(--flow)" stroke-width="2.2" stroke-linecap="round"/>`;
  }).join('');

  const SVG = {
    // Tall cylindrical purifier (Xiaomi Air Purifier 4 / 4 Pro style), 3/4 view
    purifier: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <g class="v-flowwrap">${flows(78, 92, 84, 5)}</g>
      <ellipse cx="120" cy="384" rx="78" ry="9" fill="var(--shadow)"/>
      <path d="M50 110 Q50 96 66 94 L174 94 Q190 96 190 110 L190 360 Q190 378 172 380 L68 380 Q50 378 50 360Z" fill="url(#${id}b)"/>
      <rect x="56" y="150" width="128" height="216" rx="10" fill="url(#${id}m)" opacity=".9"/>
      <rect x="56" y="150" width="128" height="216" rx="10" fill="url(#${id}b)" opacity=".35"/>
      <ellipse cx="120" cy="96" rx="70" ry="16" fill="url(#${id}t)" stroke="var(--dev-sh)" stroke-width="1"/>
      <ellipse cx="120" cy="96" rx="56" ry="12" fill="var(--dev-dark)"/>
      <g transform="translate(120 96) scale(1 .22)"><g class="v-rot">${blades(7, 54, 26)}<circle r="10" fill="var(--dev-hi)"/></g></g>
      <ellipse cx="120" cy="96" rx="56" ry="12" fill="none" stroke="var(--grill)" stroke-width="1" stroke-dasharray="2 3"/>
      <rect x="84" y="112" width="72" height="30" rx="15" fill="var(--screen)"/>
      <circle class="v-led" cx="99" cy="127" r="5" fill="var(--led)"/>
      <text class="v-pm" x="131" y="132" text-anchor="middle" font-size="14" font-weight="700" fill="var(--led)" font-family="Inter,sans-serif">--</text>
    </svg>`,

    // Pedestal fan, front view
    fan: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <ellipse cx="120" cy="386" rx="70" ry="8" fill="var(--shadow)"/>
      <ellipse cx="120" cy="374" rx="62" ry="12" fill="url(#${id}t)"/>
      <rect x="113" y="210" width="14" height="166" rx="7" fill="url(#${id}b)"/>
      <circle cx="120" cy="130" r="98" fill="var(--dev-dark)" opacity=".18"/>
      <g transform="translate(120 130)"><g class="v-rot">${blades(5, 86, 46)}</g><circle r="16" fill="var(--dev)"/><circle r="6" fill="var(--led)" class="v-led"/></g>
      <circle cx="120" cy="130" r="96" fill="none" stroke="var(--grill)" stroke-width="3"/>
      ${Array.from({ length: 18 }, (_, i) => `<line x1="120" y1="130" x2="${120 + 96 * Math.cos(i * Math.PI / 9)}" y2="${130 + 96 * Math.sin(i * Math.PI / 9)}" stroke="var(--grill)" stroke-width="1" opacity=".55"/>`).join('')}
      <circle cx="120" cy="130" r="60" fill="none" stroke="var(--grill)" stroke-width="1" opacity=".5"/>
    </svg>`,

    // Humidifier with rising mist
    humidifier: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <g class="v-flowwrap">${Array.from({ length: 7 }, (_, i) => `<circle class="v-mist" style="animation-delay:${(-i * .5).toFixed(1)}s" cx="${108 + (i % 3) * 12}" cy="150" r="${9 + (i % 3) * 4}" fill="var(--mist)"/>`).join('')}</g>
      <ellipse cx="120" cy="384" rx="80" ry="9" fill="var(--shadow)"/>
      <path d="M48 190 Q48 166 72 164 L168 164 Q192 166 192 190 L192 362 Q192 378 174 380 L66 380 Q48 378 48 362Z" fill="url(#${id}b)"/>
      <rect x="64" y="230" width="112" height="120" rx="14" fill="var(--water)" opacity=".18"/>
      <rect class="v-level" x="64" y="290" width="112" height="60" rx="14" fill="var(--water)" opacity=".45"/>
      <ellipse cx="120" cy="166" rx="72" ry="14" fill="url(#${id}t)"/>
      <circle cx="120" cy="166" r="9" fill="var(--dev-dark)"/>
      <circle class="v-led" cx="120" cy="206" r="5" fill="var(--led)"/>
    </svg>`,

    // Bulb / lamp with glow
    light: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <circle class="v-glow" cx="120" cy="150" r="118" fill="url(#${id}g)"/>
      <path d="M120 40 C 70 40 44 78 44 116 C 44 150 66 170 80 192 C 90 208 92 222 92 236 L148 236 C148 222 150 208 160 192 C 174 170 196 150 196 116 C 196 78 170 40 120 40Z" class="v-bulb" fill="var(--bulb)" stroke="var(--dev-sh)" stroke-width="2"/>
      <path d="M104 236 L104 196 Q120 170 136 196 L136 236" fill="none" stroke="var(--filament)" stroke-width="3" class="v-fil"/>
      ${[0, 1, 2, 3].map(i => `<rect x="94" y="${240 + i * 14}" width="52" height="11" rx="5" fill="url(#${id}b)"/>`).join('')}
      <path d="M100 296 L140 296 L130 316 L110 316Z" fill="var(--dev-dark)"/>
      <ellipse cx="120" cy="384" rx="44" ry="6" fill="var(--shadow)"/>
    </svg>`,

    // Smart plug / outlet
    plug: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <ellipse cx="120" cy="330" rx="86" ry="10" fill="var(--shadow)"/>
      <rect x="40" y="90" width="160" height="230" rx="36" fill="url(#${id}b)"/>
      <rect x="54" y="104" width="132" height="200" rx="28" fill="url(#${id}t)"/>
      <circle cx="120" cy="184" r="50" fill="var(--dev-dark)" opacity=".12"/>
      <rect x="96" y="160" width="10" height="34" rx="5" fill="var(--dev-dark)"/><rect x="134" y="160" width="10" height="34" rx="5" fill="var(--dev-dark)"/>
      <circle cx="120" cy="214" r="7" fill="var(--dev-dark)"/>
      <circle class="v-glow2" cx="120" cy="270" r="18" fill="var(--led)" opacity=".25" filter="url(#${id}s)"/>
      <circle class="v-led" cx="120" cy="270" r="7" fill="var(--led)"/>
    </svg>`,

    // Robot vacuum, top view
    vacuum: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <ellipse cx="120" cy="300" rx="98" ry="14" fill="var(--shadow)"/>
      <circle cx="120" cy="200" r="100" fill="url(#${id}b)"/>
      <circle cx="120" cy="200" r="86" fill="url(#${id}t)"/>
      <circle cx="120" cy="150" r="24" fill="var(--dev-dark)"/><circle cx="120" cy="150" r="14" fill="var(--dev-sh)"/>
      <rect x="92" y="226" width="56" height="10" rx="5" fill="var(--dev-dark)" opacity=".4"/>
      <g transform="translate(52 128)"><g class="v-rot">${[0, 120, 240].map(a => `<line x1="0" y1="0" x2="0" y2="-26" stroke="var(--blade)" stroke-width="3" stroke-linecap="round" transform="rotate(${a})"/>`).join('')}</g></g>
      <circle class="v-led" cx="120" cy="196" r="5" fill="var(--led)"/>
    </svg>`,

    generic: id => `<svg viewBox="0 0 240 400">${defs(id)}
      <ellipse cx="120" cy="330" rx="82" ry="10" fill="var(--shadow)"/>
      <rect x="44" y="100" width="152" height="220" rx="30" fill="url(#${id}b)"/>
      <rect x="60" y="120" width="120" height="80" rx="16" fill="var(--screen)"/>
      <circle class="v-led" cx="120" cy="160" r="9" fill="var(--led)"/>
      <rect x="70" y="230" width="100" height="70" rx="12" fill="url(#${id}m)"/>
    </svg>`,
  };

  let uid = 0;
  function create(k) {
    const el = document.createElement('div');
    el.className = 'vis vis-' + k;
    el.dataset.kind = k;
    el.innerHTML = SVG[k]('v' + (++uid));
    return el;
  }

  function update(el, s) {
    const on = !!s.on, sp = Math.max(0, Math.min(1, s.speed ?? (on ? .5 : 0)));
    el.classList.toggle('is-on', on);
    // rotation: 0.22s (max) .. 3s (min); airflow follows
    el.style.setProperty('--dur', on && sp > 0 ? (3 - 2.78 * sp).toFixed(2) + 's' : '0s');
    el.style.setProperty('--fdur', on ? (2.6 - 1.7 * sp).toFixed(2) + 's' : '0s');
    el.style.setProperty('--fop', on ? (.25 + .6 * sp).toFixed(2) : 0);
    el.style.setProperty('--led', on ? (s.color || 'var(--ok)') : 'var(--mut)');
    if (s.brightness != null) el.style.setProperty('--gl', on ? (.15 + .85 * s.brightness).toFixed(2) : 0);
    // color temperature: warm amber (0) -> cool blue-white (1)
    if (s.ct != null) el.style.setProperty('--glow', `color-mix(in srgb, #ffb347 ${((1 - s.ct) * 100).toFixed(0)}%, #cfe6ff)`);
    const pm = el.querySelector('.v-pm');
    if (pm) pm.textContent = on ? (s.pm ?? '--') : '';
    const lvl = el.querySelector('.v-level');
    if (lvl && s.level != null) { const h = 110 * s.level; lvl.setAttribute('y', 350 - h); lvl.setAttribute('height', h); }
  }

  window.VIS = { kind, create, update };
})();
