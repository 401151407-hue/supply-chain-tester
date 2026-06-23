// Patch script for electron-builder blockmap compatibility with Node 18
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';

const blockmapPath = resolve('node_modules/app-builder-lib/out/targets/blockmap/blockmap.js');

const content = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBlockMap = buildBlockMap;
async function buildBlockMap(appOutDir, packager, isTwoByte) { return null; }
`;

writeFileSync(blockmapPath, content, 'utf-8');
console.log('Patched:', blockmapPath);
