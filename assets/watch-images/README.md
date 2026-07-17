# Licensed watch image inputs

Place one licensed, front-facing, transparent-background soldier shot here for each
catalog ID. Supported formats are PNG, WebP, and AVIF. The exact filename is:

```text
<watch-id>.png
```

For example:

```text
tudor-black-bay-58-m79030n.png
```

Then run:

```sh
npm run catalog:images
```

The pipeline validates the alpha channel, contains the source in an 800×800 transparent
canvas, outputs an AVIF into `public/images/watches/`, measures its alpha bounding box,
and updates `src/data/catalog.json`. If an image is absent, a clearly non-photographic
illustration is generated so development remains functional.

Do not add scraped or unlicensed manufacturer photography. Keep a source/licence record
for every production asset. For Git repositories with large originals, use Git LFS.
