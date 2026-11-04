# LDS Game

This repository is being set up to migrate the existing [LDS Game on Netlify](https://ldsgame.netlify.app/) to GitHub Pages.

Target website after the migration: **https://lds.mrwalkermaths.com/**.

The current Netlify site will remain online until its published files can be compared with the imported GitHub copy. The goal is to preserve the existing site's content and behaviour.

GitHub Pages setup after import: use **Settings → Pages → Deploy from a branch → main / (root)**, save the custom domain `lds.mrwalkermaths.com`, and enable **Enforce HTTPS** when its certificate is ready.

Cloudflare DNS will use a DNS-only CNAME to `chriswalker-afk.github.io`.

Browser-local saved progress does not automatically transfer to a new hostname.
