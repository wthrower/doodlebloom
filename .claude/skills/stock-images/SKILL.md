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
the user does not want one. **The thumbnail is the registration.** A PNG in
`public/images/` with no thumb is inert -- it ships in `dist/` and bloats the
build, but never appears in the game.

This is what makes staging safe, and why promotion always writes both files.

## Phase 1: Prompts

Ask what to generate if the arguments do not say. Build one prompt per image
and confirm the whole list with the user before spending a cent.

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

Give the user the URL as soon as the page exists, before the first image lands.

### The poller

```html
<script>
(function () {
  const grid = document.querySelector('.grid');
  const pending = new Set();
  const baseOf = img => img.dataset.base || (img.dataset.base = img.getAttribute('src').split('?')[0]);
  for (const img of grid.querySelectorAll('.card img')) { baseOf(img); pending.add(img); }

  async function syncCards() {              // add new cards AND drop removed ones
    let doc;
    try {
      const res = await fetch('gallery.html', { cache: 'no-store' });
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (e) { return; }                 // server gone: leave the page as-is
    const wanted = new Set([...doc.querySelectorAll('.card img')].map(i => i.getAttribute('src')));
    const have = new Set([...grid.querySelectorAll('.card img')].map(baseOf));
    for (const card of doc.querySelectorAll('.card')) {
      const src = card.querySelector('img').getAttribute('src');
      if (!have.has(src)) {
        grid.appendChild(card);
        const img = card.querySelector('img'); baseOf(img); pending.add(img);
      }
    }
    for (const img of [...grid.querySelectorAll('.card img')]) {
      if (!wanted.has(baseOf(img))) { pending.delete(img); img.closest('.card').remove(); }
    }
    const order = [...doc.querySelectorAll('.card img')].map(i => i.getAttribute('src'));
    const live = new Map([...grid.querySelectorAll('.card img')].map(i => [baseOf(i), i.closest('.card')]));
    if (order.join() !== [...live.keys()].join()) {          // file order changed: restack
      for (const src of order) { const c = live.get(src); if (c) grid.appendChild(c); }
    }
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
      img.src = baseOf(img) + '?t=' + Date.now();
    }
    document.title = pending.size ? `(${pending.size}) gallery` : 'gallery';
    syncCards();
    setTimeout(tick, 4000);                 // never stops: cards can be added or removed anytime
  }
  setTimeout(tick, 1500);
})();
</script>
```

Polls every 4s and syncs the card list **both ways** against `gallery.html`:
new cards appear without a reload, cards you removed (promoted, tossed)
disappear without one, and the on-screen order follows the file's order -- so
putting two related cards adjacent in the file puts them adjacent on screen. An add-only sync leaves promoted images sitting on
the user's screen after they are gone from the file -- that bug shipped once.

It must **not** stop when `pending` empties. More images get launched
mid-session, and a stopped poller puts the user back to refreshing by hand.

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

The user reviews the gallery and reports keepers and rejects. Do not screenshot
it yourself; they look.

### Nothing gets deleted until the user asks for it by name

**A staged file is deleted only on an explicit instruction to remove, delete or
toss it.** Not on "that one's wrong", not on "try again", not on "these three
aren't working". Rejecting an image says it will not be promoted; it says
nothing about the file, which stays on disk until they ask for it to go.

The specific trap: **"do a second try at X" is not a toss instruction.** It is a
request for *another* image, alongside the one that already exists. The user keeps
round one on screen to compare round two against -- deleting it destroys the
comparison they asked for. This happened: three rejects were deleted to "make
room" for their re-rolls, and the originals were unrecoverable (`leo` writes
straight to `-o` and keeps no copies anywhere).

So a re-roll never overwrites and never clears. Generate it under a `_v2` name,
add its card next to the original's, and leave the original alone. If the v2
wins, rename the staged file to the clean name at promotion time and remove both
cards then -- see the rename warning in Phase 5.

Deleting a staged PNG is irreversible and costs real money to redo. When in
doubt, keep it: disk is free, and the stage dir gets swept at the end of the
session anyway.

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

### Promoting is TWO steps, never one

`promote-stock.sh` *moves* the PNG out of the stage dir. The gallery card still
points at the old path, so **every promotion leaves a dead link behind unless
you clear the card.** Promoting without step 2 is not finished work -- the
user has had to point this out three times in one session.

**Step 1 -- promote:**

```bash
scripts/promote-stock.sh tmp/<batch-name> <name> <name> ...
```

Moves each PNG into `public/images/` and builds its thumb; the image is live on
the next dev-server reload. With no names it promotes everything in the dir. It
refuses to overwrite an existing image without `--force`.

**Step 2 -- immediately remove those cards from the gallery, in the same
response.** Not "later", not "next time the user looks". Drive it off the promoted
names the script just printed, or off this test:

```python
lib = pathlib.Path('public/images')
def drop(m):
    fn = re.search(r'src="([^"]+)"', m.group(0)).group(1)
    return '' if (lib / fn).exists() else m.group(0)     # promoted -> remove
h = re.sub(r'<div class="card"><img src="[^"]+">.*?</div></div>\n', drop, h, flags=re.S)
```

Then print the before/after card count so the removal is visible and verified.

### The one predicate that must never be used

The test for removing a card is **"is this image now in `public/images/`"**
(promoted), or "did I just delete the staged file" (rejected).

It is **NOT** "is the staged file missing." That also matches an image *still
generating*, and deleting those cards destroys the preemptive `<img>` tags the
whole refresh model depends on. Two separate cleanup passes in one session ate
an in-flight card exactly this way.

Cards also go stale when a staged file is *renamed* before promoting (dropping a
`_v2` suffix, say) -- the card still names the old file. Rename the card's `src`
at the same time, or remove and re-add it.

### The other two outcomes

**Right subject, wrong execution -- refine:** feed the gallery's verdict into a
revised prompt and generate a fresh round under `_v2` names. The staged original
is reference material for round two -- it is not promoted, and it is **not
deleted**. Both rounds stay on the page until the user picks between them.

**Reject -- toss:** only once the user has asked for that image to be removed.
Then delete the file and remove its card in the same step. Until they ask, a
rejected image just sits there; see Phase 4.

Do not leave stage dirs lying around. Confirm with the user before deleting, then
actually delete -- a 23-image batch is ~46MB.

## Rules

- **Never `cp` a PNG into `public/images/` by hand.** Use
  `promote-stock.sh`, or you get an inert image with no thumb.
- **Never generate unstaged** unless the user explicitly wants a one-off straight
  into the library (plain `gen-stock.sh <name> "<prompt>"` still does that).
- **Confirm prompts before generating.** Images cost money.
- **Do not add a manifest.** The glob is deliberate.
- **Do not commit** until the user has tested in-app.
