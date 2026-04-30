# CloudCreate CLI

Command-line tools powered by `@cloudcreate/core`.

Online experience: https://cloudcreate.ai
GitHub repository: https://github.com/cloudcreate-ai/cloudcreate-cli

## Install

For regular use, install from npm:

```sh
npm install -g @cloudcreate/cli
```

Then run either `cloudcreate` or `cc-tools`.

For local development from this repository:

```sh
npm install
npm link
```

## Commands

```sh
cloudcreate css:minify input.css -o output.min.css --level aggressive
cloudcreate css:beautify input.css -o output.css
cloudcreate markdown:html input.md -o output.html
cloudcreate table:convert input.xlsx --format csv -o output.csv --sheet 0
cloudcreate archive:compress ./file.txt ./assets --format zip -o archive.zip
cloudcreate archive:decompress archive.zip -o ./out
cloudcreate image:compress input.png -o output.webp --quality 75 --format webp
cloudcreate pdf:info input.pdf --max-pages 2
cloudcreate open image:resize --mode width --width 1200 --quality 82 --format webp
cloudcreate open css:minify --level aggressive --print
```

Text commands write to stdout when `-o` is omitted. Binary/file-producing commands use a generated output filename when possible.
Use `cloudcreate open <tool>` for the browser-based path. It opens `cloudcreate.ai` with matching tool parameters; add `--print` to only print the URL.

## Notes

- Image compression uses `@cloudcreate/core` codecs and supports PNG, JPEG, WebP, and AVIF inputs/outputs where the runtime supports the underlying WASM codec.
- Table conversion uses `xlsx`, which currently has known upstream advisories without a fixed release.
