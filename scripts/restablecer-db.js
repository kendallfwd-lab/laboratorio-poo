'use strict';
const { copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
copyFileSync(resolve(root,'db.semilla.json'),resolve(root,'db.json'));
console.log('db.json restaurado desde db.semilla.json. Recomendado: detener JSON Server antes de restaurar.');
