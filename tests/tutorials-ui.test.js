import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('global nav and client routing expose Tutorials independently',()=>{
  const html=read('public/index.html');
  const app=read('src/client/app.js');
  assert.match(html,/data-route="tutorials"/);
  assert.match(html,/id="view-tutorials"/);
  assert.match(html,/href="\/tutorials\.css"/);
  assert.match(app,/new TutorialsView/);
  assert.match(app,/tutorialsView\.activate/);
  assert.match(app,/tutorials/);
});

test('paper theme is scoped and supports feedback, graph and motion accessibility',()=>{
  const css=read('public/tutorials.css');
  assert.match(css,/#view-tutorials/);
  assert.match(css,/\.paper-reader/);
  assert.match(css,/\.paper-lesson-picker/);
  assert.match(css,/\.paper-click-flash/);
  assert.match(css,/\.paper-speed-streak/);
  assert.match(css,/prefers-reduced-motion/);
});