import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const pngIn = path.join(dir, 'input.png');
const pngOut = path.join(dir, 'output.png');
await writeFile(pngIn, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=',
  'base64'
));
await run(['image:compress', pngIn, '-o', pngOut, '--quality', '75']);
if ((await readFile(pngOut)).length <= 0) {
  throw new Error('image:compress smoke failed');
}

const pdfIn = path.join(dir, 'input.pdf');
await writeFile(pdfIn, Buffer.from(
  'JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCA4MQo+PgpzdHJlYW0KeJwr5HIK4TJQAMGidC59j9ScstSSzOREXXMDSwsTCwNzC0sFIxOFkDQuEOnDZQhWCiFDcrlszCzMTM2cgdDNTiEkiytEi8s1hCuQCwCA0xNyCmVuZHN0cmVhbQplbmRvYmoKCjcgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA1Ci9GaXJzdCAyNgovTGVuZ3RoIDM2MAo+PgpzdHJlYW0KeJzVUk1Lw0AQve+vmKMeZD+SZhMphbZJFKQoraAoHtJkKZGyK8lG6r93JkktPYhnCcPOx5udt5knQYCCMIQAdAwhTAIFE9BSwnTK+OPXhwH+UOxMy/hdXbXwihgBa3hjfOk660Gy2YydsMvCF3u3Y0MTSAIfEQ+Nq7rSNDDNszwXQgshohAtEkKleC7REjSFMdZUjD6aDkfDnA6ECOZYyweL9NBD9R47GfszPBEbESYdsGE8xD9zaVY23KH+4pPMGF+5Ki28gYv0WgkViRAHaPTkyyX+jsYU3v3fx/X8a2d/feHZnmm9tOTGkAb6LfO1aV3XlLh2wuUOK+Tcmv2n8XVZXGmRxMhTxwlqbBQGf77fvpuyh1KYHfzNxhOHIUG5lanqYuEOqD6BXyQV6ESRBufWOk+q7PVoPbKhKBo1ekaZCDG+6ba+DykpGV8UrempnngiCVu6qrY74E+1ndu2Piboxm8E+MXaCmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQwCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJwVxLERACAMA7G3wx0t2zITUyZYhYBusyEpOVVa4oB4P18YYE8DawplbmRzdHJlYW0KZW5kb2JqCgpzdGFydHhyZWYKNjMxCiUlRU9G',
  'base64'
));
const { stdout: pdfInfo } = await run(['pdf:info', pdfIn, '--max-pages', '1']);
if (!pdfInfo.includes('"numPages": 1') || !pdfInfo.includes('"widthPts": 612')) {
  throw new Error('pdf:info smoke failed');
}

const { stdout: openUrl } = await run(['open', 'css:minify', '--level', 'aggressive', '--print']);
if (!openUrl.trim().endsWith('/css/minify?level=aggressive')) {
  throw new Error('open smoke failed');
}

console.log('smoke ok');
