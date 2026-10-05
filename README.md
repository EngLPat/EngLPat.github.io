# Luca Patrignani: personal academic website

A minimal, single-page academic website in plain HTML, CSS and JavaScript.
No frameworks, no build step. Hosted on GitHub Pages at
**https://englpat.github.io/**.

## Project structure

```
Personal_website/
├── index.html              ← all page content
├── 404.html                ← "page not found" page (the elephant)
├── robots.txt, sitemap.xml ← for search engines
├── .nojekyll               ← tells GitHub Pages to serve files as they are
├── .gitignore              ← keeps personal_infos/ out of the repository
├── assets/
│   ├── css/style.css       ← all styling (colours and fonts at the top)
│   ├── js/main.js          ← menu, greeting, London time, BibTeX copy
│   ├── js/mesh.js          ← the hero mesh and von Neumann's elephant
│   ├── fonts/              ← Inter, with its licence (OFL)
│   └── img/
│       ├── profile.jpg         ← your photo in the hero (square, 800×800)
│       ├── og-image.png        ← preview image for LinkedIn/Slack/X (1200×630)
│       ├── elephant.png        ← used by 404.html
│       ├── favicon.svg         ← browser-tab icon ("lp." monogram)
│       └── apple-touch-icon.png
└── personal_infos/         ← your private files (NOT published)
```

## Optional

- **CV:** the CV link scrolls to the CV section of the page. To use a hosted
  CV instead, replace `#cv` in the header link with its URL.

## Run it locally

- **Simplest:** double-click `index.html`.
- **VS Code:** install the *Live Server* extension, right-click `index.html`,
  choose *Open with Live Server*. The page reloads on every save.
- **Python:** run `python -m http.server 8000` in this folder, then open
  http://localhost:8000.

## Publishing updates

The site is live at https://englpat.github.io/ (repository
`EngLPat/EngLPat.github.io`, branch `main`). After editing, run this in
**PowerShell** in this folder:

```
git add -A
git status
git commit -m "Describe your change"
git push
```

Check that `git status` lists only the files you meant to change, and nothing
from `personal_infos/` (`.gitignore` keeps that folder out). The live site
updates about a minute after the push.

**If you changed the CSS or JavaScript,** first raise the `?v=` number on the
`style.css`, `main.js` and `mesh.js` links in `index.html` (and on `style.css`
in `404.html`), e.g. `?v=5` to `?v=6`. Browsers keep files for about 10 minutes,
and the new number makes them fetch the new versions straight away. To see
your own changes immediately, use a hard refresh (Ctrl+Shift+R).

## Updating content

Everything is in `index.html`. Each section starts with a comment banner, and
Publications and Talks each have a **TEMPLATE** comment: copy it, paste it
where you want the new item, and edit the text.

| To add…             | Section banner  | Copy this block           |
|---------------------|-----------------|---------------------------|
| A publication       | `PUBLICATIONS`  | `<article class="pub">…`  |
| A talk or poster    | `TALKS`         | `<li class="talk">…`      |
| A job, degree, prize| `CV`            | an `<li>` in the list     |

Tips:

- **Order:** lists show in the order you write them.
- **CV columns:** entries line up row by row across the three columns, for up
  to 8 entries per column.
- **BibTeX:** paste the entry from the publisher or Google Scholar inside
  `<pre><code>…</code></pre>`. Write any `<`, `>` or `&` as `&lt;`, `&gt;`
  and `&amp;`.
- **Links, not files:** link to DOIs and online pages rather than uploading
  PDFs.
- **Photo:** replace `assets/img/profile.jpg` with any square photo (about
  800×800 px, under 150 KB).
- **Sitemap:** after a big update, change `<lastmod>` in `sitemap.xml` to
  that day's date.

## Customising the look

The first block of `assets/css/style.css` (`:root`) holds the design tokens:

- `--bg`, `--surface`, `--border`: background, card and line colours
- `--text`, `--text-muted`, `--text-subtle`: text greys
- `--accent`: link and highlight colour
- `--font-sans`: Inter. The font file is in `assets/fonts/` and served from
  your own site, so visitors never contact Google.

Other things you can change:

- **Greeting words and colours:** `GREETINGS` near the top of `assets/js/main.js`.
- **Hero mesh and elephant:** the settings at the top of each part of
  `assets/js/mesh.js` (node spacing, how far the glow spreads, trunk wiggle).
- **Walking elephant:** walks along the footer line when visitors reach the
  bottom of the page; clicking the © sends it again (`assets/js/main.js`,
  search for "footer line").
- **The sliding elephant** (previous version) is kept, commented out, in
  `index.html` and `assets/js/main.js`. Each block explains how to restore it.

## After publishing

1. Add the site to **Google Search Console**
   (https://search.google.com/search-console) and submit
   `https://englpat.github.io/sitemap.xml`.
2. Link to the site from your Imperial profile, Google Scholar, LinkedIn and
   GitHub. Those links help people find it more than anything else.
