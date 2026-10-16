'use strict';
const fs = require('node:fs');
const path = require('node:path');
module.exports = function previewFont() {
  if (!process.env.TF_FONT || !fs.statSync(process.env.TF_FONT, {throwIfNoEntry:false})?.isFile()) {
    throw Error('Set TF_FONT to a locally licensed CJK .ttf/.ttc/.otf file. No factory font is distributed.');
  }
  return path.resolve(process.env.TF_FONT);
};
