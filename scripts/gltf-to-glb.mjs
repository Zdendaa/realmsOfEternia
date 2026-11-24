#!/usr/bin/env node
/**
 * Packs a .gltf with external .bin buffers and images into one binary .glb (the only
 * model format the client loads). No dependencies; the model data is copied unchanged.
 *
 * Usage: node scripts/gltf-to-glb.mjs <input.gltf> <output.glb>
 *
 * Every external buffer and image becomes a 4-byte aligned slice of the single BIN
 * chunk; images get a bufferView and their mimeType instead of a uri.
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  process.stderr.write('Usage: node scripts/gltf-to-glb.mjs <input.gltf> <output.glb>\n');
  process.exit(1);
}

const baseDir = dirname(resolve(input));
const gltf = JSON.parse(readFileSync(input, 'utf8'));
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const pad4 = (n) => (n + 3) & ~3;

/** Loads an external uri (relative file only: data: and remote uris are not expected). */
function readUri(uri) {
  if (/^[a-z]+:/i.test(uri)) throw new Error(`Unsupported uri "${uri}"`);
  const path = resolve(baseDir, decodeURIComponent(uri));
  if (!path.startsWith(baseDir)) throw new Error(`uri "${uri}" leaves the model folder`);
  return readFileSync(path);
}

const chunks = [];
let length = 0;
const append = (bytes) => {
  const offset = length;
  chunks.push({ offset, bytes });
  length = pad4(offset + bytes.length);
  return offset;
};

// Buffers: each becomes a region of the BIN chunk; their bufferViews shift by its offset.
const bufferOffsets = (gltf.buffers ?? []).map((buffer) => append(readUri(buffer.uri)));
for (const view of gltf.bufferViews ?? []) {
  view.byteOffset = (view.byteOffset ?? 0) + (bufferOffsets[view.buffer] ?? 0);
  view.buffer = 0;
}

// Images: embedded through new bufferViews.
gltf.bufferViews ??= [];
for (const image of gltf.images ?? []) {
  if (!image.uri) continue;
  const mimeType = MIME[extname(image.uri).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image "${image.uri}"`);
  const bytes = readUri(image.uri);
  const byteOffset = append(bytes);
  gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  image.bufferView = gltf.bufferViews.length - 1;
  image.mimeType = mimeType;
  delete image.uri;
}

const bin = Buffer.alloc(length);
for (const { offset, bytes } of chunks) bytes.copy(bin, offset);
gltf.buffers = [{ byteLength: bin.length }];

const jsonText = JSON.stringify(gltf);
const json = Buffer.alloc(pad4(Buffer.byteLength(jsonText)), 0x20);
json.write(jsonText);

const header = Buffer.alloc(12);
const total = 12 + 8 + json.length + 8 + bin.length;
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(total, 8);
const chunkHeader = (size, type) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(size, 0);
  h.writeUInt32LE(type, 4);
  return h;
};

mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(
  output,
  Buffer.concat([
    header,
    chunkHeader(json.length, 0x4e4f534a), // 'JSON'
    json,
    chunkHeader(bin.length, 0x004e4942), // 'BIN\0'
    bin,
  ]),
);
process.stdout.write(`${output}: ${total} bytes\n`);
