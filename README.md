# CreatorVault

**Generate software license keys and see what your digital-product platform really costs you.**

CreatorVault is two free, client-side tools for digital-product creators:

1. **License-key generator** — configurable format (prefix, segment count and
   length, separator, character set including Crockford base32), single or bulk
   (up to 1,000), with copy-individual, copy-all, and download to `.txt` / `.csv`.
   Randomness comes from the **Web Crypto API** (`crypto.getRandomValues`) with
   rejection sampling to eliminate modulo bias — never `Math.random()`.
2. **Creator fee comparison calculator** — enter a product price and monthly
   unit sales to see what you keep per platform (Gumroad, Lemon Squeezy, Payhip,
   and an illustrative "CreatorVault (planned)" low-fee column), with a clear
   table and the annual difference. Fee assumptions are clearly labeled,
   editable estimates.

A **Copper Bay Labs** product.

- **Live:** https://dukotah.github.io/creatorvault/
- **100% client-side.** Everything runs in your browser. Key settings, the keys
  themselves, and every number you type into the calculator are never uploaded,
  transmitted, logged, or stored. There is no backend — open the Network tab and
  watch: nothing leaves the page. It even works offline.

## Run it locally

No build step, no dependencies. Just open `index.html` in any modern browser:

```
git clone https://github.com/dukotah/creatorvault.git
cd creatorvault
# open index.html (double-click, or `start index.html` on Windows)
```

Because everything runs locally, you can disconnect from the network and it
still works. (The Web Crypto API requires a secure context — `https://` or
`file://` both qualify.)

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Both tools + marketing sections |
| `app.js` | Key generation (Web Crypto) and fee math; all client-side |
| `styles.css` | Copper Bay Labs design system |
| `about.html` | Methodology, entropy math, privacy, roadmap |
| `404.html` | Not-found page |
| `favicon.svg` | Vault + key mark |
| `og-template.html` | Source for the 1200×630 social card (render to `og-image.png`) |
| `robots.txt`, `sitemap.xml` | SEO |
| `BUILD-NOTES.md` | What shipped, the parked paid tier, limitations, follow-ups |

## What it is (and isn't)

CreatorVault is a **free tool, not professional, financial, or legal advice.**
The generated keys are high-entropy random identifiers, not signed or
self-validating licenses. The fee figures are **editable estimates** of public
list pricing — always verify each platform's current rates on its own site. See
[How it works](about.html) for the full methodology.

## Roadmap

A low-fee **hosted checkout** for creators: secure encrypted file delivery, a
license issuance/validation API so these keys can be activated and verified
automatically, and EU/UK VAT handling as Merchant of Record. See
[`BUILD-NOTES.md`](BUILD-NOTES.md) for details.

---

A [Copper Bay Labs](https://copperbaytech.com) product.
