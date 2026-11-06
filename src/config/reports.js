// Loads and validates report definitions from a YAML file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import cron from 'node-cron';
import { PERIODS, parseShift } from '../services/periods.js';

export const FORMATS = ['number', 'currency', 'percent', 'text'];
const ID_RE = /^[a-z0-9_-]+$/i;

class ConfigError extends Error {}

function fail(where, message) {
  throw new ConfigError(`${where}: ${message}`);
}

function requireString(obj, key, where) {
  if (typeof obj?.[key] !== 'string' || !obj[key].trim()) fail(where, `"${key}" is required`);
  return obj[key];
}

function validateTemplate(template, where) {
  for (const [, , fmt] of template.matchAll(/\{(\w+)(?:\|(\w+))?\}/g)) {
    if (fmt && !FORMATS.includes(fmt)) fail(where, `unknown format "|${fmt}" in item template (use ${FORMATS.join(', ')})`);
  }
}

function normalizeSection(section, where, hasCompare) {
  const type = section?.type;
  const query = requireString(section, 'query', where);

  if (type === 'metrics') {
    if (!Array.isArray(section.metrics) || !section.metrics.length) fail(where, '"metrics" must be a non-empty list');
    if (hasCompare && !query.includes('{{from}}')) {
      fail(where, 'query must filter by {{from}} / {{to}} when the report has "compare"');
    }
    return {
      type,
      query,
      metrics: section.metrics.map((m, i) => {
        const w = `${where}.metrics[${i}]`;
        const format = m.format ?? 'number';
        if (!FORMATS.includes(format)) fail(w, `unknown format "${format}" (use ${FORMATS.join(', ')})`);
        return { column: requireString(m, 'column', w), label: requireString(m, 'label', w), emoji: m.emoji ?? '', format };
      }),
    };
  }

  if (type === 'list') {
    const item = requireString(section, 'item', where);
    validateTemplate(item, where);
    return {
      type,
      query,
      item,
      title: requireString(section, 'title', where),
      emoji: section.emoji ?? '',
      ranked: Boolean(section.ranked),
      bullet: section.bullet ?? '•',
      totalColumn: section.totalColumn ?? null,
      emptyText: section.emptyText ?? null,
    };
  }

  fail(where, `unknown section type "${type}" (use "metrics" or "list")`);
}

function normalizeReport(report, index, defaults) {
  const where = `reports[${index}]${report?.id ? ` (${report.id})` : ''}`;
  const id = requireString(report, 'id', where);
  if (!ID_RE.test(id)) fail(where, `id "${id}" may only contain letters, digits, "-" and "_"`);

  const period = report.period ?? 'today';
  if (!PERIODS[period]) fail(where, `unknown period "${period}" (use ${Object.keys(PERIODS).join(', ')})`);

  const schedule = report.schedule ?? defaults.schedule;
  if (!cron.validate(schedule)) fail(where, `invalid cron schedule "${schedule}"`);

  const compare = (report.compare ?? []).map((c, i) => {
    const w = `${where}.compare[${i}]`;
    try { parseShift(c?.shift); } catch (err) { fail(w, err.message); }
    return { shift: c.shift, label: requireString(c, 'label', w) };
  });

  if (!Array.isArray(report.sections) || !report.sections.length) fail(where, '"sections" must be a non-empty list');

  return {
    id,
    title: requireString(report, 'title', where),
    emoji: report.emoji ?? '',
    enabled: report.enabled !== false,
    schedule,
    period,
    compare,
    sections: report.sections.map((s, i) => normalizeSection(s, `${where}.sections[${i}]`, compare.length > 0)),
  };
}

/**
 * Parses and validates a reports YAML document.
 * @param {string} text
 * @param {{ schedule?: string }} [defaults]
 */
export function parseReportsConfig(text, defaults = {}) {
  const doc = parse(text);
  if (!Array.isArray(doc?.reports) || !doc.reports.length) throw new ConfigError('"reports" must be a non-empty list');

  const reports = doc.reports.map((r, i) => normalizeReport(r, i, { schedule: '0 19 * * *', ...defaults }));
  const ids = new Set();
  for (const r of reports) {
    if (ids.has(r.id)) throw new ConfigError(`duplicate report id "${r.id}"`);
    ids.add(r.id);
  }
  return reports;
}

export function loadReportsConfig(path = process.env.REPORTS_CONFIG || 'config/reports.yml') {
  const file = resolve(path);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read reports config ${file}: ${err.message}`);
  }
  try {
    return parseReportsConfig(text, { schedule: process.env.REPORT_CRON_SCHEDULE || undefined });
  } catch (err) {
    throw new Error(`Invalid reports config ${file}\n  → ${err.message}`);
  }
}
