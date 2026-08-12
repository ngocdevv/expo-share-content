#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const source = path.join(process.cwd(), 'plugin', 'src', 'ios', 'ShareViewController.swift');
const destinationDirectory = path.join(process.cwd(), 'plugin', 'build', 'ios');
const destination = path.join(destinationDirectory, 'ShareViewController.swift');

if (!fs.existsSync(source)) {
  console.log('Swift template not created yet; skipping copy.');
  process.exit(0);
}

fs.mkdirSync(destinationDirectory, { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Copied ${path.relative(process.cwd(), source)} -> ${path.relative(process.cwd(), destination)}`);
