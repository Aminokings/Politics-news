// The website's own drawings (assets/art/scenes.svg), shown when a story has no photo or its
// photo fails to load. Each story gets a scene that fits its spec topic, in one of three
// looks (day, dusk, night), sometimes mirrored. The choice comes from the story's id, so a
// story always gets the same picture while neighbouring cards usually differ.

// Spec tag → scenes that fit it (one is picked per story).
export const BY_TAG = {
  'dp-democracy': ['ballot', 'protest'], 'dp-franchise': ['ballot'], 'dp-pressure': ['protest'], 'dp-rights': ['protest', 'justice'],
  'pp-established': ['rally', 'ballot'], 'pp-minor': ['rally'], 'pp-system': ['rally'],
  'es-systems': ['ballot'], 'es-referendums': ['ballot'], 'vb-voting': ['ballot'], 'vb-media': ['press'],
  'con-nature': ['constitution', 'westminster'], 'con-devolution': ['constitution', 'westminster'],
  'parl-commons': ['westminster'], 'parl-lords': ['westminster'], 'parl-legislation': ['westminster', 'constitution'],
  'exec-pm': ['downing', 'press'], 'exec-resp': ['downing', 'press'],
  'rel-judiciary': ['justice'], 'rel-execparl': ['westminster', 'downing'], 'rel-eu': ['summit', 'flags'], 'rel-sovereignty': ['westminster', 'constitution'],
  'ideas-conservatism': ['books'], 'ideas-liberalism': ['books', 'constitution'], 'ideas-socialism': ['books', 'protest'],
  'ideas-anarchism': ['books', 'protest'], 'ideas-ecologism': ['turbines', 'books'], 'ideas-feminism': ['protest', 'books'],
  'ideas-multiculturalism': ['books', 'flags'], 'ideas-nationalism': ['flags', 'books'],
  'us-constitution': ['constitution', 'capitol'], 'us-federalism': ['capitol'], 'us-congress': ['capitol'],
  'us-presidency': ['whitehouse', 'press'], 'us-scotus': ['scotus', 'justice'], 'us-rights': ['protest', 'scotus'],
  'us-elections': ['ballot', 'rally'], 'us-parties': ['rally'], 'us-groups': ['protest', 'capitol'], 'us-compare': ['capitol', 'westminster'],
  'gl-state': ['globe', 'flags'], 'gl-un-nato': ['flags', 'summit'], 'gl-economic': ['summit', 'globe'], 'gl-rights': ['justice', 'protest'],
  'gl-environment': ['turbines'], 'gl-power': ['globe', 'summit'], 'gl-regionalism': ['summit', 'flags'], 'gl-theories': ['globe', 'books'],
};
// Stories with no tag: a scene for their part of the spec, or the press pack.
const BY_COMP = { ukpol: ['ballot'], ukgov: ['westminster'], ideas: ['books'], usa: ['capitol'], global: ['globe'] };
const NO_MIRROR = new Set(['downing']); // it has a door number
const LOOKS = ['day', 'dusk', 'night'];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which drawing a story gets: { scene, look, mirror, key }.
 * `look` limits the colours: one look ('dusk') or a list to choose from (['dusk', 'night']).
 */
export function artFor(it, look) {
  const h = hash(String(it.id || it.title || ''));
  const tag = (it.tags || []).find((t) => BY_TAG[t]);
  const options = BY_TAG[tag] || BY_COMP[it.comp] || ['press'];
  const scene = options[h % options.length];
  const looks = [].concat(look || []).filter((l) => LOOKS.includes(l));
  const pool = looks.length ? looks : LOOKS;
  const lk = pool[(h >>> 5) % pool.length];
  const mirror = !NO_MIRROR.has(scene) && ((h >>> 9) & 1) === 1;
  return { scene, look: lk, mirror, key: `${scene} ${lk} ${mirror ? 1 : 0}` };
}

export const SCENE_IDS = [...new Set([...Object.values(BY_TAG).flat(), ...Object.values(BY_COMP).flat(), 'press'])];

export function sceneSvg({ scene, mirror }) {
  const flip = mirror ? ' transform="matrix(-1 0 0 1 1600 0)"' : '';
  return `<svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><use href="#art-${scene}"${flip}/></svg>`;
}

/** Swap a photo that failed to load for the story's drawing. */
export function drawInstead(mediaEl) {
  const [scene, look, mirror] = (mediaEl.dataset.art || 'press day 0').split(' ');
  mediaEl.querySelector('img')?.remove();
  if (mediaEl.querySelector('.scene')) return;
  mediaEl.classList.add('media--art', `pal-${look}`);
  mediaEl.insertAdjacentHTML('beforeend', sceneSvg({ scene, mirror: mirror === '1' }));
}

let loading = null;
/** Put the drawings into the page once, so every <use href="#art-…"> can find them. */
export function loadArt() {
  loading ||= fetch('assets/art/scenes.svg')
    .then((r) => (r.ok ? r.text() : ''))
    .then((svg) => {
      if (!svg || document.querySelector('.art-sprite')) return;
      const holder = document.createElement('div');
      holder.className = 'art-sprite';
      holder.setAttribute('aria-hidden', 'true');
      holder.innerHTML = svg;
      document.body.prepend(holder);
    })
    .catch(() => {});
  return loading;
}
