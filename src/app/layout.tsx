import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import LenisProvider from "@/components/providers/LenisProvider";
import Nav from "@/components/dom/Nav";
import CartDrawer from "@/components/dom/CartDrawer";
import StoreHydrator from "@/components/dom/StoreHydrator";
import ConsentBanner from "@/components/dom/ConsentBanner";
import SceneMount from "@/components/canvas/SceneMount";
import { CatalogueProvider } from "@/components/providers/CatalogueProvider";
import { getOverlay } from "@/lib/medusa";
import { SITE_URL } from "@/lib/site";

/**
 * Both families are self-hosted subsets rather than next/font/google, for one glyph: ₹.
 *
 * next/font/google emits every @font-face Google publishes for a family -- cyrillic, greek,
 * vietnamese, latin-ext -- and only *preloads* the subsets named in `subsets`. The rest sit in the
 * stylesheet waiting for a codepoint to summon them. U+20B9 RUPEE SIGN lives in latin-ext
 * (U+20AD-20C0), and it is in the footer of every page, so every page pulled Inter latin-ext
 * (85KB) and Playfair latin-ext (21KB) on top of the two latin faces it actually used. 106KB per
 * page, for a currency symbol.
 *
 * These two files are Google's own fonts cut to Google's own latin range plus U+20B9, so nothing
 * on the page renders differently -- ₹ is the same glyph from the same font, it just arrives in
 * the file that was already being downloaded. 192KB of fonts becomes 86KB. Recipe, if a family
 * ever needs re-cutting (needs python + `pip install fonttools brotli` in a venv):
 *
 *   fonttools varLib.instancer -o Inter-opsz14.ttf 'Inter[opsz,wght].ttf' opsz=14 wght=100:900
 *   pyftsubset Inter-opsz14.ttf --output-file=inter-latin.woff2 --flavor=woff2 \
 *     --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,\
 *                 U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,\
 *                 U+FFFD,U+20B9' \
 *     --layout-features+=tnum,onum,lnum,frac --no-hinting --desubroutinize --glyph-names=False
 *
 * The sources are ofl/inter and ofl/playfairdisplay in github.com/google/fonts. The instancer step
 * pins Inter's optical-size axis at 14 because next/font/google drops non-wght axes by default, and
 * an opsz axis left free would have `font-optical-sizing: auto` scale the design with the type size
 * -- a change in the letterforms, not just in the bytes. `--layout-features+=tnum` is not optional:
 * the cart totals and the Slow Press clock are set in tabular figures.
 */
const playfair = localFont({
  src: "./fonts/playfair-latin.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--font-playfair",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
});

const DESCRIPTION =
  "Premium herbal care, filled by a Himalayan valley. Shampoo and wellness rituals made slowly and proven properly.";

export const metadata: Metadata = {
  /* Without this, every relative URL in the metadata below is a build error, and the
     opengraph-image file convention has no origin to resolve itself against. */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Swasthvica — The valley, in every drop.",
    /* The product and shop pages set their own title and were each repeating the brand by
       hand. The template owns the suffix so the two can never drift apart. */
    template: "%s — Swasthvica",
  },
  description: DESCRIPTION,
  applicationName: "Swasthvica",
  /* This site is shared by link far more than it is searched for -- a bare URL in a WhatsApp
     thread with no card is the difference between a premium brand and a broken one. The image
     itself is src/app/opengraph-image.jpeg, picked up by file convention and inherited by every
     route below, so the shop and the five product pages all get a card without repeating it. */
  openGraph: {
    type: "website",
    siteName: "Swasthvica",
    locale: "en_IN",
    url: SITE_URL,
    title: "Swasthvica — The valley, in every drop.",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

/* Next injects the width/initial-scale meta itself; this adds the two things it cannot guess.
   The theme colour is the literal pixel at the top edge of the page -- the nav's olive-950/85
   scrim composited over the hero's #d9cba4 sky -- so the browser chrome continues the sky
   instead of drawing a hard band above it. colorScheme dark is what keeps the PDP email field
   and its autofill from rendering as a white box on olive. */
export const viewport: Viewport = {
  themeColor: "#2e3023",
  colorScheme: "dark",
};

/**
 * Every route revalidates on this layout's Medusa read.
 *
 * Next takes the lowest `revalidate` on a route as the route's own, and the catalogue is fetched
 * here because the drawer below is in the layout and needs a price on every page. That makes 60s
 * the refresh rate of the whole site, which is the right number for a shop: a price change or a
 * sold-out bottle is visible within a minute everywhere it is quoted, without a deploy.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const overlay = await getOverlay();
  return (
    // The two font variables belong on <html>, not on <body>. Tailwind's theme block defines
    // --font-display as `var(--font-playfair), Georgia, serif` on :root -- and a custom property
    // whose value references an undefined variable is invalid at computed-value time, so with
    // --font-playfair one level lower, --font-display computed to nothing on :root and inherited
    // that nothing everywhere. `.font-display` still worked because it substitutes --font-playfair
    // directly at the element, which is why the headings that used the utility looked right and
    // every heading styled through the token -- the whole of .prose-valley h2 -- silently fell
    // back to system sans.
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        {/* The first thing in the tab order on every page, and invisible until it is focused.
            Without it a keyboard user arriving on a product page walks the whole nav, the cart
            button and the drawer's trap before reaching a word of the page. `#main` is on the
            <main> of every route. It is deliberately outside LenisProvider: Lenis takes over
            scrolling, and the browser's own jump to a fragment has to land before it does. */}
        <a
          href="#main"
          className="sr-only z-[70] rounded-b-lg bg-brass-500 px-5 py-3 text-sm font-medium text-olive-950 focus:not-sr-only focus:fixed focus:top-0 focus:left-4"
        >
          Skip to the page
        </a>
        {/* Price and stock for the client half of the site. It wraps the drawer as well as the
            page, because the drawer is in the layout and quotes a total on every route. */}
        <CatalogueProvider overlay={overlay}>
          <LenisProvider>
            {/* Reads the saved cart and consent choice out of storage after mount. Both stores use
                skipHydration, so this is the one place either of them is filled -- see store.ts. */}
            <StoreHydrator />
            <SceneMount />
            <Nav />
            <CartDrawer />
            {children}
            <ConsentBanner />
          </LenisProvider>
        </CatalogueProvider>
      </body>
    </html>
  );
}
