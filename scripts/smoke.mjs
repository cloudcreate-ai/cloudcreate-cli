import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const bin = path.join(root, 'bin', 'cloudcreate.js');
const dir = await mkdtemp(path.join(tmpdir(), 'cloudcreate-cli-'));

async function run(args) {
  return exec(process.execPath, [bin, ...args], { cwd: dir });
}

const cssIn = path.join(dir, 'input.css');
const cssOut = path.join(dir, 'output.css');
await writeFile(cssIn, '.a { color: red; }');
await run(['css:minify', cssIn, '-o', cssOut, '--level', 'aggressive']);
if ((await readFile(cssOut, 'utf8')).trim() !== '.a{color:red}') {
  throw new Error('css:minify smoke failed');
}

const mdIn = path.join(dir, 'input.md');
const mdOut = path.join(dir, 'output.html');
await writeFile(mdIn, '**ok**');
await run(['markdown:html', mdIn, '-o', mdOut]);
if (!(await readFile(mdOut, 'utf8')).includes('<strong>ok</strong>')) {
  throw new Error('markdown:html smoke failed');
}

const csvIn = path.join(dir, 'input.csv');
const jsonOut = path.join(dir, 'output.json');
await writeFile(csvIn, 'a,b\n1,2\n');
await run(['table:convert', csvIn, '--format', 'json', '-o', jsonOut]);
if (!(await readFile(jsonOut, 'utf8')).includes('"a"')) {
  throw new Error('table:convert smoke failed');
}

const zipOut = path.join(dir, 'archive.zip');
const unpackDir = path.join(dir, 'unpack');
await run(['archive:compress', cssIn, '--format', 'zip', '-o', zipOut]);
await run(['archive:decompress', zipOut, '-o', unpackDir]);
if (!(await readFile(path.join(unpackDir, 'input.css'), 'utf8')).includes('color')) {
  throw new Error('archive smoke failed');
}

const png = new PNG({ width: 1, height: 1 });
png.data.set([255, 255, 255, 255]);
const pngIn = path.join(dir, 'input.png');
const pngOut = path.join(dir, 'output.png');
await writeFile(pngIn, PNG.sync.write(png));
await run(['image:compress', pngIn, '-o', pngOut, '--quality', '75']);
if ((await readFile(pngOut)).length <= 0) {
  throw new Error('image:compress smoke failed');
}

console.log('smoke ok');
