# CloudCreate CLI

Command-line tools powered by `@cloudcreate/cloudcreate-core`.

## Install

```sh
npm install
npm link
```

Then run either `cloudcreate` or `cc-tools`.

## Commands

```sh
cloudcreate css:minify input.css -o output.min.css --level aggressive
cloudcreate css:beautify input.css -o output.css
cloudcreate markdown:html input.md -o output.html
cloudcreate table:convert input.xlsx --format csv -o output.csv --sheet 0
cloudcreate archive:compress ./file.txt ./assets --format zip -o archive.zip
cloudcreate archive:decompress archive.zip -o ./out
cloudcreate image:compress input.png -o output.png --quality 75
```

Text commands write to stdout when `-o` is omitted. Binary/file-producing commands use a generated output filename when possible.

## Notes

- Image compression currently supports PNG in the Node CLI. JPEG/WebP/AVIF support should be enabled through a Node image adapter such as `sharp`.
- Table conversion uses `xlsx`, which currently has known upstream advisories without a fixed release.
