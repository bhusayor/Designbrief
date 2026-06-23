// ────────────────────────────────────────────────────────────────────
// animations.js, CSS/GSAP templates the AI Builder uses when a hero
// section doesn't need stock video or imagery (tech / SaaS / minimal /
// design-studio briefs).
//
// Each template is a function that takes [primary, bg, accent] and
// returns a complete HTML fragment with its own scoped <style>.
//
// GSAP_REVEALS bundles the script that wires data-* attributes into
// scroll-triggered animations. Inject it once per page (the builder
// adds it to the final hero section).
// ────────────────────────────────────────────────────────────────────

// Convert "#aabbcc" → "170, 187, 204" for use inside rgba().
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''))
  return m
    ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
    : '139, 92, 246'
}

function pick(arr, i, fallback) {
  const v = arr?.[i]
  if (!v) return fallback
  if (typeof v === 'string') return v
  return v.hex || v.color || fallback
}

// ── Templates ───────────────────────────────────────────────────────

const gradientMesh = (colors = []) => {
  const primary = pick(colors, 0, '#8B5CF6')
  const bg = pick(colors, 1, '#0F0F14')
  const accent = pick(colors, 2, primary)
  return `<style>
.hero-gradient { position: absolute; inset: 0; background: ${bg}; overflow: hidden; }
.hero-gradient::before, .hero-gradient::after { content: ''; position: absolute; border-radius: 50%; filter: blur(80px); }
.hero-gradient::before { width: 600px; height: 600px; background: ${primary}; opacity: 0.15; top: -100px; left: -100px; animation: gMfloat1 8s ease-in-out infinite; }
.hero-gradient::after { width: 500px; height: 500px; background: ${accent}; opacity: 0.12; bottom: -80px; right: -80px; animation: gMfloat2 10s ease-in-out infinite; }
.hero-gradient-orb { position: absolute; width: 320px; height: 320px; border-radius: 50%; background: ${primary}; opacity: 0.08; filter: blur(40px); top: 50%; left: 50%; transform: translate(-50%, -50%); animation: gMpulse 6s ease-in-out infinite; }
@keyframes gMfloat1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(60px,40px) scale(1.1); } 66% { transform: translate(-40px,60px) scale(.9); } }
@keyframes gMfloat2 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-50px,-30px) scale(1.05); } 66% { transform: translate(30px,-50px) scale(.95); } }
@keyframes gMpulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .08; } 50% { transform: translate(-50%,-50%) scale(1.3); opacity: .05; } }
</style>
<div class="hero-gradient"><div class="hero-gradient-orb"></div></div>`
}

const particles = (colors = []) => {
  const primary = pick(colors, 0, '#8B5CF6')
  const bg = pick(colors, 1, '#0A0A0F')
  return `<style>
.hero-particles { position: absolute; inset: 0; background: ${bg}; overflow: hidden; }
.hero-particles .particle { position: absolute; border-radius: 50%; background: ${primary}; animation: ptFloat linear infinite; opacity: 0; }
@keyframes ptFloat {
  0% { transform: translateY(100vh) scale(0); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translateY(-20px) scale(1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .hero-particles .particle { animation: none; } }
</style>
<div class="hero-particles" id="particleContainer"></div>
<script>
(function(){
  var c = document.getElementById('particleContainer');
  if (!c) return;
  for (var i = 0; i < 40; i++) {
    var p = document.createElement('div');
    p.className = 'particle';
    var size = Math.random() * 4 + 1;
    p.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (Math.random() * 100) + '%;animation-duration:' + (Math.random() * 15 + 10) + 's;animation-delay:' + (Math.random() * -20) + 's;opacity:' + (Math.random() * 0.6 + 0.1) + ';';
    c.appendChild(p);
  }
})();
</script>`
}

const geometric = (colors = []) => {
  const primary = pick(colors, 0, '#8B5CF6')
  const bg = pick(colors, 1, '#0F0F14')
  const accent = pick(colors, 2, primary)
  return `<style>
.hero-geometric { position: absolute; inset: 0; background: ${bg}; overflow: hidden; }
.geo-shape { position: absolute; border: 1px solid ${primary}; opacity: 0.15; animation: geoRotate linear infinite; }
.geo-1 { width: 400px; height: 400px; border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; top: -100px; right: -100px; animation-duration: 20s; }
.geo-2 { width: 300px; height: 300px; border-radius: 70% 30% 30% 70% / 70% 70% 30% 30%; bottom: -80px; left: -80px; animation-duration: 25s; animation-direction: reverse; }
.geo-3 { width: 200px; height: 200px; border-radius: 50%; top: 50%; left: 10%; animation-duration: 15s; border-color: ${accent}; }
@keyframes geoRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .geo-shape { animation: none; } }
</style>
<div class="hero-geometric"><div class="geo-shape geo-1"></div><div class="geo-shape geo-2"></div><div class="geo-shape geo-3"></div></div>`
}

const gridLines = (colors = []) => {
  const primary = pick(colors, 0, '#8B5CF6')
  const bg = pick(colors, 1, '#0A0A10')
  const rgb = hexToRgb(primary)
  return `<style>
.hero-grid { position: absolute; inset: 0; background: ${bg}; overflow: hidden; }
.hero-grid::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(${rgb}, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(${rgb}, 0.08) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: grMove 20s linear infinite;
}
@keyframes grMove { from { background-position: 0 0; } to { background-position: 60px 60px; } }
@media (prefers-reduced-motion: reduce) { .hero-grid::before { animation: none; } }
</style>
<div class="hero-grid"></div>`
}

const wave = (colors = []) => {
  const primary = pick(colors, 0, '#8B5CF6')
  const bg = pick(colors, 1, '#0A1628')
  return `<style>
.hero-wave { position: absolute; inset: 0; background: ${bg}; overflow: hidden; }
.wave-svg { position: absolute; bottom: 0; width: 200%; height: 200px; animation: wvMove 8s linear infinite; opacity: 0.3; }
.wave-svg-2 { animation-delay: -4s; animation-duration: 12s; opacity: 0.15; }
@keyframes wvMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .wave-svg, .wave-svg-2 { animation: none; } }
</style>
<div class="hero-wave">
  <svg class="wave-svg" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="${primary}" d="M0,100 C360,200 720,0 1080,100 C1260,150 1380,120 1440,100 L1440,200 L0,200 Z"/>
  </svg>
  <svg class="wave-svg wave-svg-2" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="${primary}" d="M0,80 C240,160 480,40 720,100 C960,160 1200,40 1440,80 L1440,200 L0,200 Z"/>
  </svg>
</div>`
}

export const ANIMATION_TEMPLATES = {
  gradientMesh,
  particles,
  geometric,
  gridLines,
  wave,
}

// ── GSAP scroll reveals ─────────────────────────────────────────────
// Wire data-attributes on elements:
//   data-hero-headline   → on-load dramatic reveal
//   data-hero-sub        → on-load fade up (delayed)
//   data-hero-cta        → on-load scale-in (delayed)
//   data-reveal          → scroll fade-up
//   data-stagger         → stagger immediate children on scroll
//   data-text-reveal     → scroll dramatic reveal
//   data-scale-in        → scroll scale-in
export const GSAP_REVEALS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script>
(function(){
  function init(){
    if (typeof gsap === 'undefined') return;
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      document.querySelectorAll('[data-reveal],[data-stagger]>*,[data-text-reveal],[data-scale-in],[data-hero-headline],[data-hero-sub],[data-hero-cta]').forEach(function(el){ el.style.opacity='1'; el.style.transform='none'; });
      return;
    }

    gsap.utils.toArray('[data-reveal]').forEach(function(el){
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: typeof ScrollTrigger !== 'undefined' ? { trigger: el, start: 'top 85%', once: true } : null,
      });
    });

    gsap.utils.toArray('[data-stagger]').forEach(function(parent){
      gsap.fromTo(parent.children, { opacity: 0, y: 30 }, {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out',
        scrollTrigger: typeof ScrollTrigger !== 'undefined' ? { trigger: parent, start: 'top 85%', once: true } : null,
      });
    });

    gsap.utils.toArray('[data-text-reveal]').forEach(function(el){
      gsap.fromTo(el, { opacity: 0, y: 60, skewY: 3 }, {
        opacity: 1, y: 0, skewY: 0, duration: 1, ease: 'expo.out',
        scrollTrigger: typeof ScrollTrigger !== 'undefined' ? { trigger: el, start: 'top 90%', once: true } : null,
      });
    });

    gsap.utils.toArray('[data-scale-in]').forEach(function(el){
      gsap.fromTo(el, { opacity: 0, scale: 0.85 }, {
        opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.2)',
        scrollTrigger: typeof ScrollTrigger !== 'undefined' ? { trigger: el, start: 'top 85%', once: true } : null,
      });
    });

    var headline = document.querySelector('[data-hero-headline]');
    if (headline) gsap.fromTo(headline, { opacity: 0, y: 80, skewY: 4 }, { opacity: 1, y: 0, skewY: 0, duration: 1.2, ease: 'expo.out', delay: 0.2 });

    var sub = document.querySelector('[data-hero-sub]');
    if (sub) gsap.fromTo(sub, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.6 });

    var cta = document.querySelector('[data-hero-cta]');
    if (cta) gsap.fromTo(cta, { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.5)', delay: 1.0 });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>`

// ── Picker helper ───────────────────────────────────────────────────
// Match a CSS template to brief tone words; default to gradientMesh.
export function pickCssTemplate(briefContext = {}) {
  const tone = String(briefContext.toneAndMood || briefContext.tone || '').toLowerCase()
  const personality = String(
    Array.isArray(briefContext.brandPersonality)
      ? briefContext.brandPersonality.join(' ')
      : (briefContext.brandPersonality || '')
  ).toLowerCase()
  const combined = tone + ' ' + personality

  if (/tech|digital|ai|saas|developer|code|crypto|web3/.test(combined)) return 'particles'
  if (/creative|bold|playful|artistic|gallery/.test(combined)) return 'geometric'
  if (/minimal|precise|clean|fintech|enterprise/.test(combined)) return 'gridLines'
  if (/wellness|health|calm|spa|holistic|nature/.test(combined)) return 'wave'
  return 'gradientMesh'
}

// ── Render media context as HTML the AI / iframe can drop in ────────
// mediaContext shape:
//   { type: 'video', url, thumbnail, photographer, pexels_url }
//   { type: 'image', url, photographer, pexels_url }
//   { type: 'css',   template: 'gradientMesh' | 'particles' | ... }
export function renderMediaHTML(mediaContext, briefContext = {}) {
  if (!mediaContext) return ''

  const palette = briefContext.colors || briefContext.colorDirection || []
  const primary = pick(palette, 0, '#8B5CF6')
  const bg = pick(palette, 1, '#0F0F14')
  const accent = pick(palette, 2, primary)

  if (mediaContext.type === 'video') {
    return `<!-- HERO VIDEO BACKGROUND · Photo by ${mediaContext.photographer || 'Pexels'} on Pexels -->
<div class="hero-media" style="position:absolute;inset:0;overflow:hidden;z-index:0;">
  <video autoplay muted loop playsinline preload="metadata" poster="${mediaContext.thumbnail || ''}"
    style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">
    <source src="${mediaContext.url}" type="video/mp4" />
  </video>
  <div style="position:absolute;inset:0;background:${bg};opacity:0.55;z-index:1;"></div>
</div>`
  }

  if (mediaContext.type === 'image') {
    return `<!-- HERO IMAGE BACKGROUND · Photo by ${mediaContext.photographer || 'Pexels'} on Pexels -->
<div class="hero-media" style="position:absolute;inset:0;overflow:hidden;z-index:0;">
  <img src="${mediaContext.url}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;" />
  <div style="position:absolute;inset:0;background:${bg};opacity:0.5;z-index:1;"></div>
</div>`
  }

  if (mediaContext.type === 'css') {
    const fn = ANIMATION_TEMPLATES[mediaContext.template] || ANIMATION_TEMPLATES.gradientMesh
    return fn([primary, bg, accent])
  }

  return ''
}
