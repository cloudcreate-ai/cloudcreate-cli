#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildCloudCreateToolUrl, BROWSER_TOOLS } from '@cloudcreate/core/browser';
import {
  beautify,
  minifyAggressive,
  minifyBasic,
} from '@cloudcreate/core/css';
import { markdownToHtml } from '@cloudcreate/core/markdown';
import {
  FORMATS as TABLE_FORMATS,
  parseTableSource,
  tableToOutput,
} from '@cloudcreate/core/table';
import {
  compressBrotliBytes,
  compressGzipBytes,
  compressTarGzBytes,
  compressZipBytes,
  decompressBrotliEntries,
  decompressGzipEntries,
  decompressTarGzEntries,
  decompressZipEntries,
  detectFormat,
} from '@cloudcreate/core/archive';
import {
  compressImageBytes,
  getImageFormatFromNameAndMime,
  normalizeImageFormat,
} from '@cloudcreate/core/image';
import { extractPdfPages, getPdfInfo, mergePdfDocuments } from '@cloudcreate/core/pdf';

const VERSION = '0.1.0';

function usage() {
  return `CloudCreate CLI ${VERSION}

Usage:
  cloudcreate <command> [args] [options]

Commands:
  css:minify <input> [--level basic|aggressive] [-o output]
  css:beautify <input> [-o output]
  markdown:html <input> [-o output]
  table:convert <input> --format csv|tsv|xlsx|json [-o output] [--sheet 0]
  archive:compress <paths...> --format zip|gzip|targz|brotli [-o output]
  archive:decompress <archive> [-o output-dir]
  image:compress <input> [--quality 75] [--format png|jpeg|webp|avif] [-o output]
  pdf:info <input> [--max-pages 3] [-o output.json]
  pdf:extract <input> --pages 1,3-5 [-o output.pdf]
  pdf:merge <inputs...> [-o output.pdf]
  open <tool> [tool options] [--print] [--base-url url] [--locale zh]

Global:
  -h, --help       Show help
  -v, --version    Show version
`;
}

function browserToolsHelp() {
  return BROWSER_TOOLS.map((tool) => `  ${tool.id.padEnd(18)} ${tool.path}`).join('\n');
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next == null || next.startsWith('-')) {
          options[body] = true;
        } else {
          options[body] = next;
          i += 1;
        }
      }
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const flag = token.slice(1);
      const key = flag === 'o' ? 'output' : flag === 'f' ? 'format' : flag === 'q' ? 'quality' : flag;
      const next = argv[i + 1];
      if (next == null || next.startsWith('-')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
      continue;
    }
    positionals.push(token);
  }

  return { positionals, options };
}

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
}

function requireArg(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

async function readInput(input) {
  if (input === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  return readFile(input);
}

async function writeOutput(output, data, { stdout = false } = {}) {
  const payload =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : data;
  if (!output && stdout) {
    process.stdout.write(payload);
    return;
  }
  if (!output) throw new Error('Missing output path');
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, payload);
  console.error(`Wrote ${output}`);
}

function extForFormat(format) {
  if (format === 'targz') return 'tar.gz';
  return format;
}

function defaultOutputFor(input, suffix, ext) {
  const dir = input && input !== '-' ? path.dirname(input) : process.cwd();
  const base = input && input !== '-' ? path.basename(input).replace(/\.[^.]+$/, '') : 'output';
  return path.join(dir, `${base}${suffix ? `-${suffix}` : ''}.${ext}`);
}

async function commandCssMinify(args, options) {
  const input = requireArg(args[0], 'input CSS file');
  const level = String(options.level || 'basic').toLowerCase();
  const text = (await readInput(input)).toString('utf8');
  const output = level === 'aggressive' ? minifyAggressive(text) : minifyBasic(text);
  await writeOutput(options.output, output, { stdout: true });
}

async function commandCssBeautify(args, options) {
  const input = requireArg(args[0], 'input CSS file');
  const output = beautify((await readInput(input)).toString('utf8'));
  await writeOutput(options.output, output, { stdout: true });
}

async function commandMarkdownHtml(args, options) {
  const input = requireArg(args[0], 'input Markdown file');
  const output = markdownToHtml((await readInput(input)).toString('utf8'));
  await writeOutput(options.output, output, { stdout: true });
}

async function commandTableConvert(args, options) {
  const input = requireArg(args[0], 'input table file');
  const format = String(requireArg(options.format, 'output format')).toLowerCase();
  if (!TABLE_FORMATS.includes(format)) {
    throw new Error(`Unsupported table format: ${format}`);
  }
  const sheet = Math.max(0, Number.parseInt(options.sheet ?? '0', 10) || 0);
  const result = await parseTableSource(await readInput(input), input);
  const output = tableToOutput(result, format, sheet);
  const target = options.output || defaultOutputFor(input, '', output.ext);
  await writeOutput(target, output.data);
}

async function collectArchiveEntries(paths) {
  const entries = [];

  async function visit(absPath, entryName) {
    const info = await stat(absPath);
    if (info.isDirectory()) {
      const children = await readdir(absPath);
      for (const child of children) {
        await visit(path.join(absPath, child), path.posix.join(entryName, child));
      }
      return;
    }
    if (!info.isFile()) return;
    entries.push({
      name: entryName,
      data: new Uint8Array(await readFile(absPath)),
    });
  }

  for (const p of paths) {
    const abs = path.resolve(p);
    await visit(abs, path.basename(abs));
  }

  return entries;
}

async function commandArchiveCompress(args, options) {
  const format = String(requireArg(options.format, 'archive format')).toLowerCase();
  if (!['zip', 'gzip', 'targz', 'brotli'].includes(format)) {
    throw new Error(`Unsupported archive format: ${format}`);
  }
  if (!args.length) throw new Error('Missing input path');

  let bytes;
  if (format === 'zip') {
    bytes = await compressZipBytes(await collectArchiveEntries(args));
  } else if (format === 'targz') {
    bytes = await compressTarGzBytes(await collectArchiveEntries(args));
  } else {
    if (args.length !== 1) throw new Error(`${format} accepts exactly one input file`);
    const data = new Uint8Array(await readFile(args[0]));
    bytes = format === 'gzip'
      ? await compressGzipBytes(data, path.basename(args[0]))
      : await compressBrotliBytes(data);
  }

  const output = options.output || `archive.${extForFormat(format)}`;
  await writeOutput(output, bytes);
}

function safeOutputPath(root, entryName) {
  const resolved = path.resolve(root, entryName);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }
  return resolved;
}

async function commandArchiveDecompress(args, options) {
  const input = requireArg(args[0], 'archive file');
  const format = detectFormat(input);
  if (!format) throw new Error(`Cannot detect archive format from filename: ${input}`);
  const data = await readInput(input);
  const entries =
    format === 'zip'
      ? decompressZipEntries(data)
      : format === 'targz'
        ? decompressTarGzEntries(data)
        : format === 'gzip'
          ? decompressGzipEntries(data)
          : await decompressBrotliEntries(data);
  const outDir = options.output || path.join(path.dirname(input), path.basename(input).replace(/\.(zip|tgz|tar\.gz|gz|gzip|br)$/i, ''));
  await mkdir(outDir, { recursive: true });
  for (const entry of entries) {
    if (!entry.name || entry.name.endsWith('/')) continue;
    const target = safeOutputPath(outDir, entry.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.data);
  }
  console.error(`Extracted ${entries.length} file(s) to ${outDir}`);
}

async function commandImageCompress(args, options) {
  const input = requireArg(args[0], 'input image file');
  const sourceFormat = normalizeImageFormat(getImageFormatFromNameAndMime(input, ''));
  const targetFormat = normalizeImageFormat(options.format || sourceFormat);
  const quality = Math.min(100, Math.max(0, Number(options.quality ?? 75) || 75));
  const result = await compressImageBytes(await readInput(input), {
    sourceFormat,
    targetFormat,
    quality,
  });
  const output = options.output || defaultOutputFor(input, 'compressed', result.ext);
  await writeOutput(output, result.buffer);
}

async function commandPdfInfo(args, options) {
  const input = requireArg(args[0], 'input PDF file');
  const maxPagesRaw = options['max-pages'] ?? options.maxPages ?? options.pages;
  const maxPages = maxPagesRaw == null ? undefined : Math.max(1, Number.parseInt(maxPagesRaw, 10) || 1);
  const info = await getPdfInfo(await readInput(input), { maxPages });
  const json = `${JSON.stringify(info, null, 2)}\n`;
  await writeOutput(options.output, json, { stdout: true });
}

async function commandPdfExtract(args, options) {
  const input = requireArg(args[0], 'input PDF file');
  const pages = String(requireArg(options.pages ?? options.p, 'page range')).trim();
  const result = await extractPdfPages(await readInput(input), { pages });
  const output = options.output || defaultOutputFor(input, 'extract', 'pdf');
  await writeOutput(output, result.buffer);
}

async function commandPdfMerge(args, options) {
  if (!args.length) {
    throw new Error('Missing input PDF files');
  }
  const inputs = await Promise.all(
    args.map(async (input) => ({
      name: path.basename(input),
      buffer: await readInput(input),
    })),
  );
  const result = await mergePdfDocuments(inputs);
  const output = options.output || defaultOutputFor(args[0], 'merged', 'pdf');
  await writeOutput(output, result.buffer);
}

function openUrl(url) {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function commandOpen(args, options) {
  const tool = requireArg(args[0], `browser tool\n\nAvailable tools:\n${browserToolsHelp()}`);
  const url = buildCloudCreateToolUrl(tool, {
    ...options,
    origin: options['base-url'] || options.origin,
  });
  if (options.print || options.dryRun || options['dry-run']) {
    process.stdout.write(`${url}\n`);
    return;
  }
  openUrl(url);
  process.stdout.write(`${url}\n`);
}

const commands = {
  'css:minify': commandCssMinify,
  'css:beautify': commandCssBeautify,
  'markdown:html': commandMarkdownHtml,
  'table:convert': commandTableConvert,
  'archive:compress': commandArchiveCompress,
  'archive:decompress': commandArchiveDecompress,
  'image:compress': commandImageCompress,
  'pdf:info': commandPdfInfo,
  'pdf:extract': commandPdfExtract,
  'pdf:merge': commandPdfMerge,
  open: commandOpen,
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help') {
    process.stdout.write(usage());
    return;
  }
  if (command === '-v' || command === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const handler = commands[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
  const { positionals, options } = parseArgs(rest);
  if (options.help || options.h) {
    process.stdout.write(usage());
    return;
  }
  await handler(positionals, options);
}

main().catch((error) => {
  fail(error.message || String(error));
});
