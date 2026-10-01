# Official content source

Put one package zip per text here, named `<contentId>.zip` (e.g. `tuhfatul-atfaal.zip`), in the
same format the app reads on import — see `src/domain/types.ts` and `src/samples`, or generate a
starting point from the app itself: **Settings → Developer tools → Get a sample package**.

Then run:

```bash
npm run build:catalog
```

This validates every zip (the same checks the app runs on import), and — only if every one of
them passes — writes the real files into `public/content/`: each package renamed with a hash of
its own bytes (so a stale cache can never serve the wrong version) and a `catalog.json` listing
them all. If anything fails, nothing in `public/content/` is touched.

Commit `public/content/` along with whatever you changed here. Deploying is then just the normal
`npm run build` — this script does not run automatically, so a bad zip can never reach production
by accident.

To update a text: replace its zip here and run the command again. Installed copies keep the
person's practice progress (it's stored by segment id) and the app shows them "Update available".

`content/` itself is only the working copy for whoever maintains this repo, and isn't served —
`public/content/` is what actually ships.
