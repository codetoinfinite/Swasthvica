# Swasthvica — Website Experience Plan

**Concept: DHARA — The Valley Fills the Bottle**
*Tagline: The valley, in every drop.*

Synthesized from a 3-concept design panel (cinematic / conversion / technical lenses) + adversarial judge. Winner scored 35.5/40 (premium 8.5, nature-story 9, e-com usability 9.5, feasibility 8.5); the strongest ideas from the two runner-up concepts are grafted in below, and judged-harmful ideas are explicitly banned.

---

## Core metaphor

One drop of Himalayan water is followed for the entire home scroll — condensing from dawn mist, falling down the waterfall, drawing golden "essence threads" out of amla, jasmine and tulsi as it travels the stream, and finally falling into the open neck of the Swasthvica bottle as it rises, wet, out of the river beside the stone chhatri. No factory, no fill line: **the valley itself is the bottling plant**. Scroll position IS the drop's journey — the visitor personally carries the drop from cloud to collar. "Nature is providing the bottle to us" is literally staged.

---

## Confirmed decisions (owner, 2026-08-21)

- Canonical brand spelling: **Swasthvica**
- Commerce: **frontend-first** — full site + cart UI now, product data in code, payments (Razorpay/Stripe) wired later
- 3D bottle: **procedural** (lathe cylinder + brass torus collar + primitive pump, label texture baked from recreated SVG artwork, validated against the two product photos)
- 4 remaining SKUs: **invented placeholders** — real data replaces later

## Product line (placeholder names)

| SKU | Category | Biome | Grade |
|---|---|---|---|
| Herbal Shampoo | hair care (exists) | **The Waterfall Pool** — plunge pool, cool mist, jasmine + amla at waterline | cool greens, white highlights, gold rim-light |
| Hairfall Defense | hairfall | **The Rooted Bank** — bhringraj/amla roots gripping wet stone, low angle | deepest olive + earth umber |
| Vitality | sexual wellness | **The Dusk Garden** — chhatri at dusk, ashwagandha/shatavari, night jasmine, fireflies | brass gold on near-black olive; discreet, sensory, zero explicitness |
| Digestive Care | digestive | **The Sunlit Terrace** — stepped herb terraces, morning light, ginger/ajwain/triphala, steam wisp | amla yellow-green + warm cream |
| Sugar Balance | diabetes support | **The Stone Spring** — still glass-clear spring, gurmar/jamun/methi, near-motionless water | cool wet-stone grey + restrained gold |

All five biomes are one shared valley kit (same terrain/fog/vegetation/water systems, different grading + set dressing).

⚠️ **Claims compliance**: Sugar Balance must never imply it treats diabetes; Vitality copy stays wellness-framed. All category copy uses "supports / traditionally used for" + medical disclaimer (India AYUSH + ad-platform rules).

---

## Sitemap

- `/` — Home: the 7-act scroll journey (~9.5 viewports)
- `/shop` — calm grid, photograph-first cards, biome-tint hover, filter by concern; **no scroll hijack**
- `/products/[slug]` — herbal-shampoo, hairfall-defense, vitality, digestive-care, sugar-balance
- `/valley` — brand story: abbreviated 3-act journey (sourcing, gatherers, process) + SVG ingredient-origin map. Closer: **"The River Sets It Down"** — water level recedes leaving the bottle on wet slate (the counterpart to home's rise).
- `/ingredients` — **Living Herbarium**: one entry per hero herb (amla, bhringraj, jasmine, tulsi, ashwagandha, shatavari, ginger, triphala, gurmar, jamun); gold line-art draws itself (DrawSVG) then dissolves into photography; cross-links to PDPs. Doubles as ingredient-SEO surface and feeds the PDP emissive-mask system from the same SVG assets.
- `/journal` — editorial articles, pure DOM, SEO surface
- Cart = slide-over drawer on every page (zustand, optimistic); `/checkout` standard flow, zero 3D
- `/account`, `/shipping-returns`, `/privacy`, `/terms`, `/contact` — olive/cream DOM only

Persistent from 0% scroll: top-nav Shop link + cart icon + a quiet skip affordance. **Commerce lands by ~58% of the home scroll — never later.**

---

## Home: the 7 acts

### Act 1 — MIST (Dawn Over the Valley) · 0–10%
4 layered ridge-silhouette planes (procedurally generated alpha cards, back-lit) behind an FBM-displaced foreground terrain, height-falloff volumetric-tinted fog (warm haze #C9A24A at horizon). Camera high in mist, dollying forward/pitching down. The hero drop condenses mid-air (MeshTransmissionMaterial icosphere fading in; fresnel-fake on low GPU tier). Cream Didone wordmark + gold ring logo as DOM; SplitText headline rises **on load, not scroll**.
**Ambient motion (mist drift, water) idles even at scroll 0 — only the camera obeys the user.**
Sync: ScrollTrigger scrub (0.8) → zustand → useFrame maath-damped: camera along CatmullRomCurve3 (`getPointAt`), fog density 1.0→0.55, drop condensation uniforms. Copy: *"Before the first drop, there is the valley."*

### Act 2 — THE FALL (Waterfall Descent) · 10–24%
Camera **cranes alongside** the waterfall (never POV over the edge — banned). Waterfall = **curved ribbon mesh, ~200×40 segments, scrolling FBM foam mask + soft-particle spray** (grafted spec — flagship water). Wet slate cliff (displaced planes, Polyhaven wet-rock PBR, roughness lowered at waterline). Hero drop rides ahead of camera with gold rim-light; instanced ferns whip past in near field.
**Suspended-drop mechanic (grafted signature interaction): stop scrolling mid-descent and the drop hangs in air, refracting the valley** (256px-clamped transmission buffer; fresnel fallback tier). Scroll is gravity.
**Velocity-aware water (grafted): Lenis scroll velocity feeds a uTurbulence uniform on spray/flow** — the world reacts to touch.
Water flow stays time-based when scroll stops. No screen-shake, no radial blur (banned). Copy: *"Water that has fallen a thousand feet learns softness."*

### Act 3 — THE GATHERING (Herbs by the Stream) · 24–42%
Stream level: wet slate slabs, instanced tulsi/jasmine/fern clusters (crossed alpha cards, vertex wind sway), amla fruits (instanced, wrap-lit). Three herb stations; at each, a **curl-noise GPU particle stream (~3k brass-gold points) lifts off the plants and flows along a curve into the drop** — the drop gains a stepped gold core (0→⅓→⅔→1).
**Scrolling backwards pulls the essence back out of the drop** — the mechanic teaches itself in one gesture.
Per station (40vh pin): DrawSVG scrubs gold line-art of the herb (the bottle's actual print motifs) beside photography. Copy: *"The valley does the formulating. We do the gathering."* Stations: *AMLA — picked at first light / JASMINE — opened overnight / TULSI — grown on the temple terrace.*

### Act 4 — THE OFFERING (Nature Hands Us the Bottle) · 42–58% — the signature act
The stone chhatri (procedural lathe columns + vine cards) over a still pool; faked god-rays (6 tilted additive planes, animated noise masks). Staged the grafted way:
1. The drop falls; **a ripple-ring shader blooms where it lands**;
2. **the bottle rises out of the ripple through the Gerstner water surface** — wet (roughness 0.05, darkened albedo, ~20 droplet sprites streaming down the cylinder UV) — and **dries to true matte olive via one wetness uniform across exactly 8% of scroll**;
3. **wet-sheath shell mesh dissolves bottom-to-top** as it clears;
4. gold botanical line-art **draws itself in light** on the bottle (screen-matched DrawSVG overlay);
5. **god-ray intensity peaks exactly as the bottle settles** — light blesses the product;
6. brass collar catches one scripted sun glint keyed to a single scroll instant.
**The bottle rises complete — pump already seated.** No assembly beat (banned: reads as a factory). The drop's parabolic fall into the neck + 12-frame radial splash morph + rising inner fill-level = THE FILL.
DOM background crossfades mist-grey → deep olive. Copy: *"Nature provides the bottle."* (nothing more — "we only add the seal" banned). Then *"SWASTHVICA HERBAL SHAMPOO — filled by the valley."* CTAs: **"Shop now"** (plain, unambiguous) + "Meet the collection ↓".

### Act 5 — FIVE STREAMS (The Commerce Heart) · 58–78%
**Waterfall wipe**: camera passes through the falls via a custom postprocessing pass — scene render-target UVs offset by a scrolling FBM refraction map, scrubbed 0→1→0. Emerges above a river delta splitting into five glowing channels, one per biome.
Over this, **real DOM commerce**: five product cards (photograph-first, price, 1-line benefit, Add to Cart) in a horizontal rail. Hover/focus tints canvas fog + key light to that product's biome grade (400ms uniform lerp); its channel brightens. Camera pans at 0.5× section scroll so cards stay readable. Card hover = pointer-driven, never scroll-driven.
**Unreleased SKUs (Vitality, Digestive Care, Sugar Balance) render as mist-condensation bottles** (grafted): instanced points sampled off the bottle mesh via MeshSurfaceSampler, lerping curl-noise mist ↔ surface positions, condensation tied to scroll-proximity. Card: *"Condensing soon"* + notify-me. Same treatment on `/shop` and pre-launch PDPs.
Copy: *"One river. Five remedies."*

### Act 6 — THE RITUAL (Craft & Proof) · 78–92%
Canvas recedes to soft-focus bokeh-leaf backdrop. Editorial DOM: mortar & pestle photography, corked oil bottle, two-column Didone layout with gold rule + leaf-glyph dividers. Trust band: AYUSH/GMP marks, no-sulphates/parabens/mineral-oil icon row in gold line-art, three reviews, founder's note. The bottle's full botanical print, rebuilt as one large SVG, draws itself across the section (DrawSVG = section scroll). No pinning — deliberately restful, scrolls natively fast. Copy: *"Made slowly. Proven properly."*

### Act 7 — DUSK (The Return) · 92–100%
Final wide: bottle on wet slate at the river's edge; sun-elevation + color-temperature uniforms sweep gold → dusk teal-navy, fog re-thickens, ~30 firefly sprites blink on. Final CTA *"Take the valley home"* → Shop. Newsletter: *"Letters from the valley — one a month, no more."* **At 97% the canvas frame freezes and the frameloop pauses** — footer (deep olive, gold rules, cream Didone) slides over a still image; GPU cost → 0 the moment the story ends.

---

## PDP design

Split conversion-first layout:
- **LEFT (sticky, 55%)**: live procedural bottle in the product's biome lighting preset. Drag-to-rotate ±35° with spring return — pointer events confined to the viewer zone; **page scroll is never hijacked**. Three gold-dot ingredient hotspots. Photographic fallback server-rendered beneath the canvas — PDP complete before any 3D hydrates.
- **RIGHT (45%, pure DOM)**: breadcrumb, name in cream Didone, letterspaced gold category caps (matching bottle typesetting), star row, price + size, subscribe-and-save toggle, olive Add-to-Cart with gold hover sheen (→ zustand, opens cart drawer, never navigates), accordions (INCI + Ayurvedic ingredients / 3-step ritual / shipping).
- **Below the fold — "What the valley put in"**: one block per hero herb; as each enters, ScrollTrigger drives that botanical's **emissive-mask uniform so its motif lights up gold on the live 3D bottle** — ingredient storytelling physically anchored to the pack.
- **PDP chapter law (grafted)**: discrete tweens on entry, never scrubbed; `frameloop="demand"` + `invalidate()` so the GPU idles while the user reads.
- **Drop-to-cart flight (grafted)**: on Add-to-Cart, project the bottle mouth to screen space, fly a brass droplet along a GSAP bezier into the cart ring icon, one ripple. Reduced-motion: simple badge increment.

---

## Architecture

- **ONE persistent fixed fullscreen R3F canvas** behind the DOM (`pointer-events: none` except the PDP viewer zone), mounted in the App Router root layout — route changes never rebuild the WebGL context. Per-route "stage" components mount/unmount scene content.
- **Scroll spine**: Lenis → GSAP ScrollTrigger (scrub 0.8) normalizes each act 0–1 → zustand → `useFrame` maath-damps → (a) camera via CatmullRomCurve3 + parallel look-at curve, (b) uniforms, (c) act-local GSAP timelines for object choreography. One master timeline per act.
- **Act-boundary mechanism (grafted standard): whiteout/mist airlock** — spray or fog coverage driven to 1 hides every stage unmount/mount; the journey reads continuous, built at solo cost.
- **World kit (all procedural/free)**: terrain = plane displaced by FBM heightmap baked once at init; far mountains = ridge-silhouette alpha cards generated on an offscreen 2D canvas; fog = custom shader chunk (height falloff + horizon warm tint); water = 3 summed Gerstner waves + fresnel/env; waterfall = ribbon mesh + FBM foam + soft-particle spray; vegetation = InstancedMesh alpha cards (Polyhaven textures) with vertex wind; light = one directional key + golden-hour HDRI (KTX2), sun position/temperature as uniforms. **No MeshReflectorMaterial anywhere** (banned — second scene render); still water fakes reflection with Gerstner-zero + fresnel + env sampling.
- **Bottle**: lathe cylinder + torus brass collar + primitive matte-black pump; 2048px baked label texture from pixel-faithful SVG recreation of the gold botanical artwork, validated against `public/products/*.jpeg`.

## Performance budgets (hard rules)

- ≤150 draw calls · ≤25k live particles · ≤1.5M on-screen vertices · single 2048 label texture + atlased vegetation · KTX2-compressed HDRI/plates · zero real-time shadows (baked AO + blob shadows)
- **≤6ms JS / ≤8ms GPU per act**, verified with r3f-perf before any act merges
- GPU-tier detect (detect-gpu) at boot: DPR clamp (1.75 discrete / 1.25 integrated), particle multipliers, transmission vs fresnel-fake drop. drei PerformanceMonitor adaptive DPR, floor 1.0; sustained <45fps → **self-demote to "plates mode" (the mobile 2.5D pipeline) without reload — built early, not last**
- Act streaming: only current act ±1 mounted; next act's textures preload during current
- Frameloop pauses whenever canvas is fully occluded (Act 6 cover, post-97% footer, cart drawer, /journal, /checkout)
- Transmission/refraction mounts **only in its own act** — never a standing per-frame RT cost
- LCP: hero headline + poster image server-rendered (<2s); three.js chunks dynamically imported after first paint; Add-to-Cart + nav work before any 3D hydrates; checkout ships zero 3D bytes
- Reference machine: integrated Iris Xe laptop. Anything below 60fps in Act 4 there gets **cut, not optimized later**

## Mobile

Mobile never runs the scrubbed 3D camera. Each act = hand-graded **2.5D cinemagraph**: 3–4 depth-plane WebP images (exported from desktop scenes, portrait art direction) parallaxing at different rates, plus one small DPR-1 canvas running only the cheap life-sellers (mist drift, essence particles at ¼ count, drop as sprite). **Act 4 fill survives as a scroll-scrubbed 24-frame image sequence** — signature beat kept, engine not. Home trimmed to ~6.5 viewports. PDP: swipe-to-rotate 36-frame sprite sequence baked from the procedural bottle; sticky bottom ATC bar; 44px targets. Full browse→PDP→cart→checkout functional and JS-light.
`prefers-reduced-motion` (any device): static frames, no parallax, opacity-only transitions.

## Banned (judge kill-list)

Per-character live-blur fog typography · POV waterfall plunge / radial blur / screen-shake · commerce gated past ~58% · frozen hero at scroll 0 · full live-3D mobile · still-sequence mobile pipeline (beyond the one 24-frame beat) · always-mounted refraction · MeshReflectorMaterial water · pump-assembly beat · precious CTA labels ("Receive it") · "we only add the seal" copy.

## Build order

1. **M0 — Foundation**: root layout with persistent canvas, Lenis+ScrollTrigger+zustand scroll spine, fonts (Didone serif + humanist sans via next/font), palette tokens, nav + cart drawer shell.
2. **M1 — Look-dev gate (go/no-go)**: Act 4 (bottle rise + fill) + shampoo PDP with procedural bottle. *If Act 4 doesn't look premium, nothing downstream fixes it.* Budgets enforced from here.
3. **M2 — The journey**: Acts 1–3, 5 (with waterfall wipe + mist-condensation bottles), 6, 7. Plates-mode fallback built here, not last.
4. **M3 — Commerce surfaces**: /shop, 5 PDPs, cart flow, invented product data module.
5. **M4 — Depth pages**: /valley (with "The River Sets It Down" closer), /ingredients herbarium, /journal shell, utility pages.
6. **M5 — Mobile plates + hardening**: 2.5D pipeline, reduced-motion, WebGL context-loss recovery, ScrollTrigger route-cleanup, 20× home↔PDP heap-leak test, Lighthouse CI on /shop + PDP.
7. **Later**: payments (Razorpay/Stripe), real product data + photography for 4 SKUs.

Pre-agreed cut order if scope bites: fireflies → god-rays → refraction wipe → Act 3 station 3 → biome-tint hovers. **Never cut: the fill, the wet-bottle rise, the PDP viewer.**

## Key risks

- Procedural-realism gap → photographic plates + fog/grain/grading carry realism; 3D carries motion. Act 4 is the one scene that must survive close-up scrutiny — hence M1 gate.
- Scroll-fatigue vs sales → Shop/cart from 0%, skip CTA, commerce by 58%; measure and shorten acts if <40% of purchasers touch Acts 1–4.
- Integrated-GPU cliff → tiered fallbacks + self-demoting plates mode, built early.
- WebGL fragility → handle `webglcontextrestored`, kill/rebuild ScrollTriggers on route change, heap-snapshot the home↔PDP loop.
- Claims exposure → "supports/traditionally used for" copy pattern + disclaimer, reviewed pre-launch.
