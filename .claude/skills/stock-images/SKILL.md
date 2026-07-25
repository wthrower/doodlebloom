---
name: stock-images
description: "Generate doodlebloom stock puzzle images -- stage a batch, review it in a gallery, promote the keepers, toss the rest"
argument-hint: "<subject or theme> [count]"
allowed-tools: Bash, Read, Write, Edit
---

Generate stock puzzle images for doodlebloom. Batch-oriented: you are keeping
a dozen out of twenty, not picking one finalist.

Do NOT use `/gallery-iterate` for this. It generates at 1024x1024, calls
`~/src/leo/cli.py` directly (so no style suffix), and finishes by copying one
file to a destination -- which produces no thumbnail, and therefore an image
the game cannot see.

## The one invariant

`StartScreen.tsx` globs `public/images/thumbs/*.webp`. There is no manifest and
Woody does not want one. **The thumbnail is the registration.** A PNG in
`public/images/` with no thumb is inert -- it ships in `dist/` and bloats the
build, but never appears in the game.

This is what makes staging safe, and why promotion always writes both files.

## Phase 1: Prompts

Ask what to generate if the arguments do not say. Build one prompt per image
and confirm the whole list with Woody before spending a cent.

Naming: `snake_case`, subject first, style qualifier last --
`autumn_forest_cel`, `athena_stained_glass`, `vw_van`. The filename becomes the
in-game label via `prettyImageLabel` ("Autumn Forest Cel"), so it is
user-visible. Make it read well.

**Avoid filenames that ad blockers filter.** A thumbnail named `jellyfish`
matched a filter list and broke the strip; it was renamed `sea_jellyfish`
(commit `c0e3a6f`). Steer clear of ad-adjacent words -- `banner`, `sponsor`,
`popup`, `ad`, and animal names that collide with ad-tech products.

## Phase 2: Scaffold the gallery FIRST

Build the contact sheet **before** generating anything. Every card gets a real
`<img src="<name>.png">` naming the file that is about to exist:

```html
<div class="card"><img src="fox_reading.png"><div class="label">fox_reading</div></div>
```

Never a placeholder `<div>` or a text stub -- the whole model is "the tag is
already there, the file appears, the page picks it up." Broken-image icons in
the gap are expected and fine.

### Serve it over HTTP, not file://

```bash
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
nohup python3 -m http.server "$PORT" --directory tmp/<batch-name> > /dev/null 2>&1 &
explorer.exe "http://localhost:$PORT/gallery.html" 2>/dev/null   # exits nonzero on success
```

**Do not open the gallery as a `file://` URL.** Under the `file:` scheme a
query string is part of the filename, not a query -- so the poller's
`?t=<now>` cache-buster asks for a file that cannot exist and every retry
fails silently. The page then only updates on a manual reload, which is the
thing the poller exists to avoid. `fetch()` of a sibling file is also blocked
under `file://`, so card auto-sync cannot work there either. Serving over HTTP
fixes both.

Give Woody the URL as soon as the page exists, before the first image lands.

### The poller

```html
<script>
(function () {
  const grid = document.querySelector('.grid');
  const pending = new Set(document.querySelectorAll('.card img'));

  async function syncCards() {          // pick up cards added to the file since load
    try {
      const res = await fetch('gallery.html', { cache: 'no-store' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const have = new Set([...grid.querySelectorAll('.card img')].map(i => i.dataset.base || i.getAttribute('src')));
      for (const card of doc.querySelectorAll('.card')) {
        const src = card.querySelector('img').getAttribute('src');
        if (!have.has(src)) { grid.appendChild(card); pending.add(card.querySelector('img')); }
      }
    } catch (e) { /* server gone; keep polling images */ }
  }

  function tick() {
    for (const img of [...pending]) {
      if (img.complete && img.naturalWidth > 0) {
        pending.delete(img);
        img.closest('.card').classList.add('loaded');
        const s = img.closest('.card').querySelector('small');
        if (s) s.textContent = 'ready';
        continue;
      }
      const base = img.dataset.base || (img.dataset.base = img.getAttribute('src').split('?')[0]);
      img.src = base + '?t=' + Date.now();
    }
    document.title = pending.size ? `(${pending.size}) gallery` : 'gallery';
    syncCards();
    setTimeout(tick, 4000);           // never stops: new cards can arrive at any time
  }
  setTimeout(tick, 1500);
})();
</script>
```

Polls every 4s. It must **not** stop when `pending` empties -- more images get
launched mid-session, and a stopped poller means Woody is back to refreshing by
hand. `syncCards` is what lets a newly launched image appear without a reload.

### Inserting cards

**Put a `<!--CARDS-->` marker at the end of the grid and insert against that**,
never against `</div></body>` or any other incidental string. Editing the page
later changes those strings, and a `str.replace()` that matches nothing fails
*silently* -- the cards never appear while the images generate fine. That
happened mid-batch and cost three invisible images. After inserting, assert the
card count went up.

## Phase 3: Stage the batch

Never generate straight into `public/images/`. Stage into a gitignored dir --
the same dir the gallery lives in, so the `<img>` paths are plain filenames:

```bash
scripts/gen-stock.sh --stage tmp/<batch-name> <name> "<prompt>"
```

`--stage` writes only the PNG and skips the thumb, so nothing reaches the game
until it has been reviewed.

For a batch, write `tmp/gen-jobs.sh` with a `JOBS` array of `name|prompt`
entries and run `scripts/gen-batch.sh`, which fans out in parallel.

**Style:** `gen-stock.sh` appends the suffix from `prompts/style-suffix.txt`
(single source of truth, shared with `src/hooks/useOpenAI.ts` -- never copy its
text into a prompt or a doc). It asks for flat cel-shaded art with crisp
unbroken boundaries, no drawn outlines, and dense detail built from many
mid-sized shapes rather than fine texture.

Two things the suffix deliberately does NOT ban, both removed on purpose:
**gradients** (the app has logic for banding, and the ban was costing range) and
**painterly/watercolor texture**. Do not reintroduce either. Outlines and
depth-of-field blur stay banned -- the app derives its own outlines from region
boundaries via `useOutlineSvg`, so drawn keylines become thin dark regions that
fight the edge detection.

Pass `--no-style` only when the prompt dictates a look that competes with it --
stained glass, art deco, mosaic, folk art. Roughly a quarter of the existing
library is stylized that way, so this is not an edge case.

## Phase 4: Review

Woody reviews the gallery and reports keepers and rejects. Do not screenshot it
yourself; he looks. Delete a reject only when he says to toss it, then remove
its card in the same step.

Judge for the game, not for beauty. A doodlebloom image needs **distinct color
areas with crisp boundaries**, and enough of them -- thin detail that cannot be
filled by hand is the failure mode, not tonal variation. Gradients are fine.

Failure modes actually seen, worth checking every candidate for:

- **Drawn outlines** -- black keylines around shapes. Always a reject; they
  become thin dark regions and duplicate what `useOutlineSvg` does at runtime.
- **Too little detail** -- large empty areas, subject reduced to a handful of
  shapes. The most common complaint.
- **Slivers** -- water ripples, snow streaks, spiky foliage, fur strokes.
- **Instructions rendered literally** -- asking for a golden ratio composition
  drew the spiral and its rectangles on top of the picture. Describe the effect
  you want, never name the construct.
- **Anatomy** -- a bat hanging upside down came back with its head rotated
  right-way-up. Check orientation on anything inverted or unusual.

## Phase 5: Promote, refine, toss

Every candidate ends up in exactly one of three states. Both promote and refine
are real -- do not assume a batch is destined for one or the other, ask which
each keeper is.

**Good enough as generated -- promote:**

```bash
scripts/promote-stock.sh tmp/<batch-name> <name> <name> ...
```

That moves each PNG into `public/images/` and builds its thumb -- the image is
live on the next dev-server reload. With no names it promotes everything in the
dir. It refuses to overwrite an existing image without `--force`.

**Right subject, wrong execution -- refine:** feed the gallery's verdict into a
revised prompt and generate a fresh round under new names. The staged file is
reference material for round two, not something to promote later.

**Reject -- toss:** it goes out with the stage dir.

**Keep the gallery in sync.** `promote-stock.sh` *moves* the PNG out of the
stage dir, so a promoted card becomes a dead link. Remove its card as part of
promoting, and remove a rejected image's card when you delete the file.

Removing cards is where it is easy to break the gallery. The test for "should
this card go" is **"is this image now in `public/images/`"** (promoted), or
"did I just delete the staged file" (rejected). It is NOT "is the staged file
missing" -- that also matches an image still generating, and deleting those
cards destroys exactly the preemptive `<img>` tags the refresh model depends
on. Two separate cleanup passes in one session ate an in-flight card this way.

Do not leave stage dirs lying around. Confirm with Woody before deleting, then
actually delete -- a 23-image batch is ~46MB.

## Rules

- **Never `cp` a PNG into `public/images/` by hand.** Use
  `promote-stock.sh`, or you get an inert image with no thumb.
- **Never generate unstaged** unless Woody explicitly wants a one-off straight
  into the library (plain `gen-stock.sh <name> "<prompt>"` still does that).
- **Confirm prompts before generating.** Images cost money.
- **Do not add a manifest.** The glob is deliberate.
- **Do not commit** until Woody has tested in-app.
