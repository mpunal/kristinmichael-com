/* kristinmichael.com — venue map + offline PNG export
   Wrapped in an IIFE: script.js declares everything in the shared global
   scope, so a colliding top-level const would throw and kill the file. */
(function () {
  'use strict';

  /* ── Venue data (finalised 2026-07-26) ──────────────────────────────── */
  const DATA = {
    nodes: {
      n1:{x:168,y:170}, n3:{x:199,y:233}, n4:{x:124,y:215}, n6:{x:334,y:346},
      n8:{x:442,y:308}, n9:{x:387,y:177}, n11:{x:515,y:287}, n12:{x:565,y:310},
      n13:{x:590,y:362}, n14:{x:605,y:408}, n16:{x:730,y:308}, n17:{x:697,y:377},
      n18:{x:523,y:463}, n19:{x:422,y:544}, n20:{x:372,y:648}, n24:{x:789,y:636},
      n25:{x:689,y:592}, n26:{x:644,y:576}, n27:{x:499,y:600}, n28:{x:793,y:731},
      n29:{x:852,y:649}, n30:{x:571,y:676}, n31:{x:449,y:259}
    },
    edges: [
      ['n3','n6'], ['n8','n11'], ['n11','n12'], ['n12','n13'], ['n13','n14'],
      ['n16','n17'], ['n17','n14'], ['n14','n18'], ['n18','n19'], ['n19','n20'],
      ['n30','n24'], ['n24','n25'], ['n25','n26'], ['n26','n27'], ['n27','n20'],
      ['n28','n29'], ['n29','n24'], ['n1','n3'], ['n4','n3'], ['n6','n8'],
      ['n9','n31'], ['n31','n8']
    ],
    /* Numbered in the order a guest passes them driving in from Hwy 321, not
       grouped by type: 1 is the gate you arrive at, 2 the office you check in
       at, and the numbers climb along the roads from there — down the office
       spur, round the main loop past both event venues, up to Chestnut, out to
       the back gate, then along the northern arm to the overlook and the two
       chapels at the far west end. The legend renders in this array's order,
       so the array order and the numbering have to stay in step. */
    markers: [
      { n:1,  x:786, y:737, name:'Main Entrance (Hwy 321)',   desc:'Primary entrance to the venue' },
      { n:2,  x:559, y:702, name:'Office',                    desc:'Main office' },
      { n:3,  x:593, y:639, name:'Cherokee House',            desc:'Guest Lodging' },
      { n:4,  x:542, y:652, name:'Sequoia Cottage',           desc:'Guest Lodging' },
      { n:5,  x:641, y:545, name:'Overmountain Hall',         desc:'Thursday Welcome Party, Friday Reception, Saturday Dinner' },
      { n:6,  x:523, y:563, name:'Maple Meadow',              desc:'Covered gazebos · Saturday Field Day' },
      { n:7,  x:560, y:395, name:'Chestnut Farmhouse',        desc:'Guest Lodging' },
      { n:8,  x:740, y:285, name:'Back Entrance (Elk Ridge)', desc:'Secondary entrance' },
      { n:9,  x:475, y:240, name:'Hemlock House',             desc:'Guest Lodging' },
      { n:10, x:381, y:168, name:'Overlook Deck',             desc:'Large Deck with views at the top of the venue (no bathrooms)' },
      { n:11, x:165, y:158, name:'Sitton House',              desc:'Bridal Party Lodging' },
      { n:12, x:118, y:211, name:'Campbell Cabin',            desc:'Bridal Party Lodging' }
    ],
    /* Decorative filler. Placed in the genuinely empty pockets of the cropped
       view and hugging its edges, so they frame the roads instead of floating
       mid-field. Every one is checked clear of a node, marker or road. */
    trees: [[620,175,44],[820,200,46],[830,450,48],[156,470,72],[232,640,50],[370,730,40]],
    pond:  [700,706,52,22]
  };

  /* The window the map is drawn through — used by BOTH the on-page SVG and the
     poster, so they can never drift apart.
     Roads and markers occupy x 118–852, y 158–737 by centre, but a pin is r15
     and an entrance gate reaches +24, so the real drawn extent is
     x 101.5–861, y 141.5–751. This is that, plus ~22 units of margin. */
  const VIEW = { x:80, y:120, w:804, h:654 };

  /* Five kinds of marker, and every marker is exactly one of them. A guest
     scanning twelve identical pins finds nothing, so the four things that are
     not "a place on the property" each get their own silhouette:
       event     — gold star, the two places the weekend actually happens
       chapel    — where the bridal party stays
       viewpoint — the one marker that names a view rather than a building
       entrance  — the two ways in
     Nothing downstream branches on a marker number; it branches on the kind. */
  const ENTRANCE_PINS  = new Set([1, 8]);    /* Hwy 321, Elk Ridge */
  const EVENT_PINS     = new Set([5, 6]);    /* Overmountain Hall, Maple Meadow */
  const CHAPEL_PINS    = new Set([11, 12]);  /* Sitton House, Campbell Cabin */
  const VIEWPOINT_PINS = new Set([10]);      /* Overlook Deck */

  function markerKind(n) {
    if (ENTRANCE_PINS.has(n))  return 'entrance';
    if (EVENT_PINS.has(n))     return 'event';
    if (CHAPEL_PINS.has(n))    return 'chapel';
    if (VIEWPOINT_PINS.has(n)) return 'viewpoint';
    return 'dot';
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

  const GATE_BODY  = 'M -3 -14 L -21 0 L -3 14 L 20 14 Q 24 14 24 10 L 24 -10 Q 24 -14 20 -14 Z';
  const GATE_ARROW = 'M 1 -7 L -10 0 L 1 7';

  /* Deliberately a fat star: the classic 0.382 inner ratio leaves a centre too
     narrow for a two-digit numeral. Every shape here is sized for two digits
     even where today's numbering gives it one, so that renumbering the markers
     stays a data change and never a geometry change. */
  const STAR_RATIO = 0.58;
  const STAR_MAP_R = 20;   /* against r15 for a dot — the size gap is the point */
  /* Larger than the r13 legend disc it sits beside, for two reasons: a star
     reads optically smaller than a disc of the same radius, and a two-digit
     numeral at 13px is 14.5 wide against an r13 star's 15.1 of usable
     interior — visibly cramped under a loupe. At r15 that interior is 17.4. */
  const STAR_KEY_R = 15;

  /* Keep in sync with --map-star. The poster is rasterised through <img>, which
     resolves no custom properties — same reason --map-road has a hex twin below. */
  const STAR_GOLD = '#E9B23C';
  const STAR_INK  = '#3D2B1F';
  const PIN_TERRA = '#C27347';   /* twin of --terra, for the same reason */

  function starPath(outerR) {
    const innerR = outerR * STAR_RATIO;
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? innerR : outerR;
      const angle = Math.PI * i / 5 - Math.PI / 2;   /* i = 0 is the top point */
      d += `${i ? 'L' : 'M'} ${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)} `;
    }
    return d + 'Z';
  }

  const STAR_MAP_D = starPath(STAR_MAP_R);
  const STAR_KEY_D = starPath(STAR_KEY_R);

  /* A star's centroid is its geometric centre — five-fold symmetry guarantees it
     — but the room inside is not symmetric. The widest cut through the shape is
     at the two side points (0.31r above centre); straight below centre you hit
     the notch at 0.58r. So a numeral has to ride slightly high to look centred,
     and by a fraction of the radius, not a fixed amount: the same 2px that
     reads level on the r20 map pin is 15% of the r13 legend chip. */
  const starNumDy = outerR => -0.07 * outerR;
  const STAR_MAP_DY = starNumDy(STAR_MAP_R);
  const STAR_KEY_DY = starNumDy(STAR_KEY_R);

  /* A chapel: gabled nave, steeple cross, and a numeral sitting on the nave
     like a door plaque. Every proportion is a multiple of the half-width so
     the map pin and the two legend keys are one shape at three sizes. The
     roof is shallow and the nave nearly square on purpose — those are the
     proportions that leave room for two digits at 15px. */
  const CHAPEL_MAP_W   = 19;     /* half-width; 38 × 44 overall, against r20 for a star */
  const CHAPEL_KEY_W   = 15;
  /* Larger than the 13 a disc chip uses: the numeral has to fit the nave, not
     the whole shape, and the nave is only 0.945w of it. */
  const CHAPEL_SHEET_W = 14;

  function chapelPath(w) {
    const u = n => (w * n).toFixed(2);
    return (
      /* roof and nave, one outline, wound clockwise */
      `M ${u(-1)} ${u(0.105)} L 0 ${u(-0.63)} L ${u(1)} ${u(0.105)} ` +
      `L ${u(0.79)} ${u(0.105)} L ${u(0.79)} ${u(1.05)} L ${u(-0.79)} ${u(1.05)} L ${u(-0.79)} ${u(0.105)} Z ` +
      /* cross, also clockwise, running far enough down to bite into the roof —
         nonzero fill then unions the two instead of leaving a hairline */
      `M ${u(-0.105)} ${u(-1.26)} L ${u(0.105)} ${u(-1.26)} L ${u(0.105)} ${u(-1.105)} ` +
      `L ${u(0.315)} ${u(-1.105)} L ${u(0.315)} ${u(-0.895)} L ${u(0.105)} ${u(-0.895)} ` +
      `L ${u(0.105)} ${u(-0.47)} L ${u(-0.105)} ${u(-0.47)} L ${u(-0.105)} ${u(-0.895)} ` +
      `L ${u(-0.315)} ${u(-0.895)} L ${u(-0.315)} ${u(-1.105)} L ${u(-0.105)} ${u(-1.105)} Z`
    );
  }

  /* Nave spans 0.105w to 1.05w; its centre is 0.579w below the shape's origin. */
  const chapelNumDy = w => 0.579 * w;

  /* Binoculars, for the Overlook Deck — the one marker that names a view
     rather than a building. Two objective barrels, a bridge band across the
     middle and a pair of shorter eyecups below. A spyglass was tried first and
     does not survive this scale: its tube has to be thinner than its eyepiece
     to read as a tube, so at 30px the tube disappears into the disc and only
     the far end shows, like a tag stuck to a pin. Binoculars are compact and
     symmetric, and the bridge is a full-width rectangle — which is the part
     that has to hold two digits.
     Everything is one outline, so the cream halo traces the silhouette. */
  const BINOC_MAP_W   = 20;   /* half-width; 40 × 38 overall, same span as a star */
  const BINOC_KEY_W   = 15.2;
  const BINOC_SHEET_W = 14;

  /* Fractions of the half-width. Two capsule barrels either side of a gap,
     bridged across the middle. The corner radius is doing the real work: with
     square ends the same layout reads as a letter H, and it is the rounded
     lens ends that make it binoculars. The bridge only has to span the gap —
     in that band the union of bridge and both barrels is the icon's full
     width, which is the room the numeral needs. */
  const BINOC = {
    top: -1, bottom: 0.90, corner: 0.35, halfGap: 0.15,
    bridgeTop: -0.40, bridgeBottom: 0.50, bridgeHalf: 0.20
  };

  function binocularsPath(w) {
    const b = BINOC;
    const u = n => (w * n).toFixed(2);
    const r = u(b.corner);
    /* Clockwise, like every other subpath here, so nonzero fill unions the
       three pieces instead of punching the overlaps out as holes. */
    const barrel = (x0, x1) =>
      `M ${u(x0)} ${u(b.top + b.corner)} A ${r} ${r} 0 0 1 ${u(x0 + b.corner)} ${u(b.top)} ` +
      `L ${u(x1 - b.corner)} ${u(b.top)} A ${r} ${r} 0 0 1 ${u(x1)} ${u(b.top + b.corner)} ` +
      `L ${u(x1)} ${u(b.bottom - b.corner)} A ${r} ${r} 0 0 1 ${u(x1 - b.corner)} ${u(b.bottom)} ` +
      `L ${u(x0 + b.corner)} ${u(b.bottom)} A ${r} ${r} 0 0 1 ${u(x0)} ${u(b.bottom - b.corner)} Z `;
    return (
      barrel(-1, -b.halfGap) +
      barrel(b.halfGap, 1) +
      `M ${u(-b.bridgeHalf)} ${u(b.bridgeTop)} L ${u(b.bridgeHalf)} ${u(b.bridgeTop)} ` +
      `L ${u(b.bridgeHalf)} ${u(b.bridgeBottom)} L ${u(-b.bridgeHalf)} ${u(b.bridgeBottom)} Z`
    );
  }

  /* The bridge runs bridgeTop..bridgeBottom; its centre is where the numeral
     goes, a shade below the shape's own origin. */
  const binocNumDy = w => w * (BINOC.bridgeTop + BINOC.bridgeBottom) / 2;

  const CHAPEL_MAP_D     = chapelPath(CHAPEL_MAP_W);
  const CHAPEL_KEY_D     = chapelPath(CHAPEL_KEY_W);
  const CHAPEL_SHEET_D   = chapelPath(CHAPEL_SHEET_W);
  const BINOC_MAP_D   = binocularsPath(BINOC_MAP_W);
  const BINOC_KEY_D   = binocularsPath(BINOC_KEY_W);
  const BINOC_SHEET_D = binocularsPath(BINOC_SHEET_W);

  /* Where each kind's numeral sits, measured from the marker's own origin. */
  const MAP_NUM = {
    entrance: { x: 12, dy: 0 },               /* inside the gate's wide end */
    event:    { x: 0,  dy: STAR_MAP_DY },     /* rides high — see starNumDy */
    chapel:    { x: 0, dy: chapelNumDy(CHAPEL_MAP_W) },
    viewpoint: { x: 0, dy: binocNumDy(BINOC_MAP_W) },   /* on the bridge */
    dot:       { x: 0, dy: 0 }
  };

  /* Legend keys, at a size that reads inside a 24px row chip. Each carries its
     own viewBox because these shapes have different aspect ratios, and one
     shared square box would shrink the tallest to fit and leave its numeral
     unreadable. Every box is centred on the numeral, not on the shape, so the
     numerals stay in one straight column down the legend. */
  const LEGEND_KEYS = {
    event: {
      cls: 'map-key-star', d: STAR_KEY_D, dy: STAR_KEY_DY, darkNum: true,
      viewBox: `${-STAR_KEY_R} ${-STAR_KEY_R} ${STAR_KEY_R * 2} ${STAR_KEY_R * 2}`
    },
    chapel: {
      cls: 'map-key-chapel', d: CHAPEL_KEY_D, dy: chapelNumDy(CHAPEL_KEY_W), darkNum: false,
      /* 1.26w above the origin for the cross, 1.05w below for the base. */
      viewBox: `${-CHAPEL_KEY_W - 0.5} ${-CHAPEL_KEY_W * 1.26 - 0.5} ${CHAPEL_KEY_W * 2 + 1} ${CHAPEL_KEY_W * 2.31 + 1}`
    },
    viewpoint: {
      cls: 'map-key-viewpoint', d: BINOC_KEY_D, dy: binocNumDy(BINOC_KEY_W), darkNum: false,
      /* Symmetric in x already; the shape runs -w to 0.9w vertically. */
      viewBox: `${-BINOC_KEY_W - 0.5} ${-BINOC_KEY_W - 0.5} ${BINOC_KEY_W * 2 + 1} ${BINOC_KEY_W * 1.9 + 1}`
    }
  };

  /* The printed sheet's legend has no CSS to lean on: every chip is drawn
     centred on one point and the numeral is placed by hand from it. */
  const SHEET_KEY_DY = {
    entrance:  0,
    event:     STAR_KEY_DY,
    chapel:    chapelNumDy(CHAPEL_SHEET_W),
    viewpoint: binocNumDy(BINOC_SHEET_W),
    dot:       0
  };

  /* ── On-page map ─────────────────────────────────────────────────────── */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVGNS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  };

  function renderMap() {
    const svg = document.getElementById('venue-map');
    if (!svg) return;

    /* VIEW is the single source of truth. The markup carries the same viewBox
       so the card reserves its aspect ratio before this runs (no layout jump);
       this line is what actually governs. */
    svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`);

    const scenery = svgEl('g', { 'aria-hidden': 'true' });
    DATA.trees.forEach(([cx, cy, r]) =>
      scenery.appendChild(svgEl('circle', { cx, cy, r, fill: 'var(--map-tree)', opacity: 0.6 })));
    scenery.appendChild(svgEl('ellipse', {
      cx: DATA.pond[0], cy: DATA.pond[1], rx: DATA.pond[2], ry: DATA.pond[3],
      fill: 'var(--map-pond)', opacity: 0.75
    }));
    svg.appendChild(scenery);

    /* Three passes so every road casts one continuous edge, top and centre
       line — drawing each road fully before the next would show its seams. */
    const layers = ['map-edge-base', 'map-edge-top', 'map-edge-dash']
      .map(cls => ({ g: svgEl('g', {}), cls }));
    layers.forEach(({ g }) => svg.appendChild(g));
    DATA.edges.forEach(([from, to]) => {
      const a = DATA.nodes[from], b = DATA.nodes[to];
      if (!a || !b) return;
      const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      layers.forEach(({ g, cls }) => g.appendChild(svgEl('path', { d, class: cls })));
    });

    const pins = svgEl('g', {});
    DATA.markers.forEach(m => {
      const kind = markerKind(m.n);
      const g = svgEl('g', { transform: `translate(${m.x},${m.y})` });
      if (kind === 'entrance') {
        g.appendChild(svgEl('path', { class: 'map-gate', d: GATE_BODY }));
        g.appendChild(svgEl('path', { class: 'map-gate-arrow', d: GATE_ARROW }));
      } else if (kind === 'event') {
        g.appendChild(svgEl('path', { class: 'map-star', d: STAR_MAP_D }));
      } else if (kind === 'chapel') {
        g.appendChild(svgEl('path', { class: 'map-chapel', d: CHAPEL_MAP_D }));
      } else if (kind === 'viewpoint') {
        g.appendChild(svgEl('path', { class: 'map-viewpoint', d: BINOC_MAP_D }));
      } else {
        g.appendChild(svgEl('circle', { class: 'map-dot', r: 15 }));
      }
      const label = svgEl('text', {
        class: kind === 'event' ? 'map-num map-num--onstar' : 'map-num',
        x: MAP_NUM[kind].x,
        y: 1 + MAP_NUM[kind].dy
      });
      label.textContent = m.n;
      g.appendChild(label);
      pins.appendChild(g);
    });
    svg.appendChild(pins);
  }

  /* ── On-page legend ──────────────────────────────────────────────────── */
  function renderLegend() {
    const list = document.getElementById('map-legend-list');
    if (!list) return;
    DATA.markers.forEach(m => {
      const li = document.createElement('li');
      const kind = markerKind(m.n);
      const glyph = LEGEND_KEYS[kind];
      /* Glyph keys are drawn from the same builders the map uses, so a key and
         its marker can never drift. Entrances keep the plain green chip they
         have always had — a gate does not survive being shrunk to 24px. */
      const key = glyph
        ? `<svg class="map-key map-key--glyph map-key--${kind}" viewBox="${glyph.viewBox}" aria-hidden="true">` +
            `<path class="${glyph.cls}" d="${glyph.d}"/>` +
            `<text class="map-key-num${glyph.darkNum ? ' map-key-num--dark' : ''}" y="${glyph.dy}" dominant-baseline="central">${m.n}</text>` +
          `</svg>`
        : `<span class="map-key${kind === 'entrance' ? ' map-key--entry' : ''}" aria-hidden="true">${m.n}</span>`;
      li.innerHTML =
        key +
        `<span class="map-text">` +
          `<span class="map-place">${esc(m.name)}</span>` +
          `<span class="map-desc">${esc(m.desc)}</span>` +
        `</span>`;
      list.appendChild(li);
    });
  }

  /* ====================================================================
     OFFLINE EXPORT — one Letter-proportioned PNG, built entirely in the
     browser so a guest can save it before losing signal.
     ==================================================================== */

  /* Fonts here are deliberately system stacks, NOT Playfair/Lato. An SVG
     loaded through <img> cannot fetch any external resource, so webfonts
     are unavailable in the raster no matter what. Changing these to the
     site fonts silently falls back to Times. */
  const POSTER_SERIF = "Georgia, 'Times New Roman', serif";
  const POSTER_SANS  = 'Helvetica, Arial, sans-serif';

  const SHEET = {
    W: 1000, PAD: 34, GUTTER: 26,
    MAP_TOP: 148,
    DESC_SIZE: 12.5, DESC_LEAD: 16, MAX_DESC_LINES: 2
  };

  /* Shared measuring context. <foreignObject> would give free wrapping but
     rasterises blank when an SVG is drawn to canvas, so lines are measured
     and broken by hand with the exact font the SVG will use. */
  const ruler = document.createElement('canvas').getContext('2d');

  function wrapText(text, font, maxWidth, maxLines) {
    ruler.font = font;
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    let truncated = false;
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (!line || ruler.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
        if (lines.length === maxLines) { truncated = true; break; }
      }
    }
    if (line && lines.length < maxLines) lines.push(line);

    /* Signal dropped copy instead of losing it silently — if this ever shows
       up on the sheet, the description needs shortening, not the layout. */
    if (truncated) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ruler.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '…';
    }
    return lines;
  }

  function buildPosterSVG() {
    const { W, PAD, GUTTER, MAP_TOP, DESC_SIZE, DESC_LEAD, MAX_DESC_LINES } = SHEET;
    const mapW = W - PAD * 2;
    const mapH = Math.round(mapW * VIEW.h / VIEW.w);
    const mapBottom = MAP_TOP + mapH;

    const colW = (mapW - GUTTER) / 2;
    const colX = [PAD, PAD + colW + GUTTER];
    /* Clears the widest chip. The star still is one, at 13 + 15 = 28; the
       binoculars reach 13 + 14 = 27. */
    const textX = 38;
    const descFont = `${DESC_SIZE}px ${POSTER_SANS}`;

    /* Measure first: row height follows the longest description, so the
       sheet is exactly as tall as the copy requires and no taller. */
    const rows = DATA.markers.map(m => ({
      marker: m,
      lines: wrapText(m.desc, descFont, colW - textX, MAX_DESC_LINES)
    }));
    const maxLines = Math.max(...rows.map(r => r.lines.length));
    const rowH = 30 + maxLines * DESC_LEAD;
    const perCol = Math.ceil(rows.length / 2);

    const legendTitleY = mapBottom + 40;
    const legendTop    = mapBottom + 62;
    const legendH      = perCol * rowH;
    /* Bottom padding is tuned so W/H lands just above Letter's 0.7727: the
       sheet is then width-constrained on a printed page, which is what makes
       the type come out as large as possible. */
    const H            = legendTop + legendH + 44;

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#FAF6EF"/>`);

    /* Masthead */
    s.push(`<text x="${W / 2}" y="44" text-anchor="middle" font-family="${POSTER_SANS}" font-size="14" font-weight="bold" letter-spacing="4.5" fill="#3A5C3A">SUGAR HOLLOW RETREAT</text>`);
    s.push(`<text x="${W / 2}" y="96" text-anchor="middle" font-family="${POSTER_SERIF}" font-size="46" fill="#3D2B1F">Venue Map</text>`);
    s.push(`<text x="${W / 2}" y="127" text-anchor="middle" font-family="${POSTER_SERIF}" font-size="17" font-style="italic" fill="#8B7355">Butler, Tennessee &#183; September 25, 2026</text>`);

    /* Map card. The clip keeps a stray road end from bleeding past the corner. */
    const k = mapW / VIEW.w;
    s.push(`<clipPath id="sheet-map-clip"><rect x="${PAD}" y="${MAP_TOP}" width="${mapW}" height="${mapH}" rx="14"/></clipPath>`);
    s.push(`<rect x="${PAD}" y="${MAP_TOP}" width="${mapW}" height="${mapH}" rx="14" fill="#DBE2CF" stroke="#D4C4A8"/>`);
    s.push(`<g clip-path="url(#sheet-map-clip)"><g transform="translate(${PAD},${MAP_TOP}) scale(${k}) translate(${-VIEW.x},${-VIEW.y})">`);

    DATA.trees.forEach(([cx, cy, r]) =>
      s.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#C2CFB0" opacity="0.6"/>`));
    s.push(`<ellipse cx="${DATA.pond[0]}" cy="${DATA.pond[1]}" rx="${DATA.pond[2]}" ry="${DATA.pond[3]}" fill="#BCD0CF" opacity="0.75"/>`);

    const road = (width, colour, extra = '') => DATA.edges.forEach(([from, to]) => {
      const a = DATA.nodes[from], b = DATA.nodes[to];
      if (a && b) s.push(`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`);
    });
    road(18, '#8C7B63');
    road(11, '#D8C29A');
    road(2,  '#FAF6EF', 'stroke-dasharray="1.5 11" opacity="0.85"');

    DATA.markers.forEach(m => {
      const kind = markerKind(m.n);
      s.push(`<g transform="translate(${m.x},${m.y})">`);
      if (kind === 'entrance') {
        s.push(`<path d="${GATE_BODY}" fill="#3A5C3A" stroke="#FAF6EF" stroke-width="2.6" stroke-linejoin="round"/>`);
        s.push(`<path d="${GATE_ARROW}" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else if (kind === 'event') {
        s.push(`<path d="${STAR_MAP_D}" fill="${STAR_GOLD}" stroke="#FAF6EF" stroke-width="3" stroke-linejoin="round"/>`);
      } else if (kind === 'chapel') {
        s.push(`<path d="${CHAPEL_MAP_D}" fill="${PIN_TERRA}" stroke="#FAF6EF" stroke-width="3" stroke-linejoin="round" paint-order="stroke"/>`);
      } else if (kind === 'viewpoint') {
        s.push(`<path d="${BINOC_MAP_D}" fill="${PIN_TERRA}" stroke="#FAF6EF" stroke-width="3" stroke-linejoin="round" paint-order="stroke"/>`);
      } else {
        s.push(`<circle r="15" fill="${PIN_TERRA}" stroke="#FAF6EF" stroke-width="3"/>`);
      }
      /* Baseline set by hand, not dominant-baseline: an SVG rasterised through
         <img> gets no say in which engine reads it, and Safari's support has
         been uneven. 15px numerals centre on a baseline ~5.4 below centre. */
      s.push(`<text x="${MAP_NUM[kind].x}" y="${5.4 + MAP_NUM[kind].dy}" text-anchor="middle" font-family="${POSTER_SANS}" font-size="15" font-weight="bold" fill="${kind === 'event' ? STAR_INK : '#FFFFFF'}">${m.n}</text>`);
      s.push('</g>');
    });
    s.push('</g></g>');

    /* Legend */
    s.push(`<text x="${W / 2}" y="${legendTitleY}" text-anchor="middle" font-family="${POSTER_SERIF}" font-size="24" fill="#3D2B1F">Locations</text>`);
    rows.forEach((row, i) => {
      const m = row.marker;
      const kind = markerKind(m.n);
      const x = colX[i < perCol ? 0 : 1];
      const y = legendTop + (i % perCol) * rowH;
      if (kind === 'entrance') {
        s.push(`<rect x="${x}" y="${y}" width="26" height="26" rx="7" fill="#3A5C3A"/>`);
      } else if (kind === 'event') {
        s.push(`<g transform="translate(${x + 13},${y + 13})"><path d="${STAR_KEY_D}" fill="${STAR_GOLD}"/></g>`);
      } else if (kind === 'chapel') {
        s.push(`<g transform="translate(${x + 13},${y + 13})"><path d="${CHAPEL_SHEET_D}" fill="${PIN_TERRA}"/></g>`);
      } else if (kind === 'viewpoint') {
        s.push(`<g transform="translate(${x + 13},${y + 13})"><path d="${BINOC_SHEET_D}" fill="${PIN_TERRA}"/></g>`);
      } else {
        s.push(`<circle cx="${x + 13}" cy="${y + 13}" r="13" fill="${PIN_TERRA}"/>`);
      }
      s.push(`<text x="${x + 13}" y="${y + 18 + SHEET_KEY_DY[kind]}" text-anchor="middle" font-family="${POSTER_SANS}" font-size="13" font-weight="bold" fill="${kind === 'event' ? STAR_INK : '#FFFFFF'}">${m.n}</text>`);
      s.push(`<text x="${x + textX}" y="${y + 14}" font-family="${POSTER_SERIF}" font-size="17" fill="#3D2B1F">${esc(m.name)}</text>`);
      row.lines.forEach((line, li) =>
        s.push(`<text x="${x + textX}" y="${y + 31 + li * DESC_LEAD}" font-family="${POSTER_SANS}" font-size="${DESC_SIZE}" fill="#8B7355">${esc(line)}</text>`));
    });

    s.push(`<text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-family="${POSTER_SANS}" font-size="12" letter-spacing="2" fill="#B8A88A">KRISTINMICHAEL.COM</text>`);
    s.push('</svg>');
    return { svg: s.join(''), W, H };
  }

  /* data: not blob: — the site's CSP allows img-src 'self' data: only. */
  function generatePNG() {
    return new Promise((resolve, reject) => {
      const { svg, W, H } = buildPosterSVG();
      const image = new Image();
      image.onload = () => {
        const scale = 2;                            /* legible when zoomed */
        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.drawImage(image, 0, 0, W, H);
        try {
          resolve({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = () => reject(new Error('SVG could not be rasterised'));
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function wireDownload() {
    const button = document.getElementById('map-download');
    const panel  = document.getElementById('map-save-panel');
    const poster = document.getElementById('map-poster');
    const link   = document.getElementById('map-save-link');
    const error  = document.getElementById('map-error');
    if (!button) return;

    button.addEventListener('click', async () => {
      const label = button.innerHTML;
      button.disabled = true;
      button.textContent = 'Preparing your map…';
      error.hidden = true;

      try {
        const png = await generatePNG();
        poster.src = png.url;
        link.href = png.url;
        panel.hidden = false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        /* In-page, never alert() — native dialogs break browser automation. */
        error.textContent = 'Sorry, the map image could not be created on this device. You can still screenshot the map above.';
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.innerHTML = label;
      }
    });
  }

  renderMap();
  renderLegend();
  wireDownload();

})();
