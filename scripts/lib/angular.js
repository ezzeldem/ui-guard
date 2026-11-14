'use strict';
// Read angular.json (pick the app project) without modifying it.
const path = require('path');
const u = require('./util');

function readAngular(root, profile) {
  const file = path.join(root, 'angular.json');
  const text = u.readText(file);
  if (text == null) return null;
  let json;
  try { json = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return { error: 'angular.json is not valid JSON: ' + e.message, text }; }
  const projects = json.projects || {};
  let name = (profile && profile.angular && profile.angular.project) || json.defaultProject;
  if (!name || !projects[name]) name = Object.keys(projects).find((k) => projects[k].projectType === 'application') || Object.keys(projects)[0];
  const projectConfig = projects[name] || {};
  const build = (projectConfig.architect && (projectConfig.architect.build || projectConfig.targets && projectConfig.targets.build)) || {};
  const options = build.options || {};
  const styles = (options.styles || []).map((s) => (typeof s === 'string' ? { input: s, inject: true, raw: s } : { input: s.input, inject: s.inject !== false, bundleName: s.bundleName, raw: s }));
  const serve = (projectConfig.architect && projectConfig.architect.serve) || {};
  const port = (serve.options && serve.options.port) || 4200;
  return { json, text, name, projectConfig, build, options, styles, builder: build.builder || '', port };
}

/** 1-based line of the first occurrence of a JSON string value in angular.json text. */
function lineOf(text, needle) {
  const i = text.indexOf(JSON.stringify(needle));
  return i < 0 ? 1 : u.lineAt(text, i);
}

module.exports = { readAngular, lineOf };
