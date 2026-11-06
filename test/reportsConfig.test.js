import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReportsConfig } from '../src/config/reports.js';
import { parseShift, shiftRange, applyRange, PERIODS } from '../src/services/periods.js';

const minimal = (extra = '') => `
reports:
  - id: r1
    title: Test
    ${extra}
    sections:
      - type: metrics
        query: SELECT COUNT(*) AS n FROM orders WHERE created_at >= {{from}} AND created_at < {{to}}
        metrics:
          - { column: n, label: N }
`;

test('valid config is normalized with defaults', () => {
  const [r] = parseReportsConfig(minimal());
  assert.equal(r.period, 'today');
  assert.equal(r.schedule, '0 19 * * *');
  assert.equal(r.enabled, true);
  assert.deepEqual(r.compare, []);
  assert.equal(r.sections[0].metrics[0].format, 'number');
});

test('default schedule can come from env', () => {
  const [r] = parseReportsConfig(minimal(), { schedule: '30 8 * * *' });
  assert.equal(r.schedule, '30 8 * * *');
});

test('config errors name the exact location', () => {
  const cases = [
    [minimal('period: tomorrow'), /reports\[0\] \(r1\): unknown period "tomorrow"/],
    [minimal('schedule: "every day"'), /invalid cron schedule/],
    [minimal('compare: [{ shift: "1 DAY; DROP TABLE x", label: y }]'), /compare\[0\]: Invalid shift/],
    [minimal().replace('label: N', 'label: N, format: money'), /metrics\[0\]: unknown format "money"/],
    [minimal().replace('type: metrics', 'type: chart'), /sections\[0\]: unknown section type "chart"/],
    [minimal().replace('id: r1', 'id: "bad id"'), /may only contain/],
    ['reports: []', /non-empty list/],
    [minimal() + minimal().replace('reports:\n', ''), /duplicate report id "r1"/],
  ];
  for (const [yaml, expected] of cases) assert.throws(() => parseReportsConfig(yaml), expected);
});

test('compare requires the metrics query to use {{from}}', () => {
  const yaml = minimal('compare: [{ shift: 1 DAY, label: yesterday }]').replace(/WHERE.*$/m, '');
  assert.throws(() => parseReportsConfig(yaml), /must filter by \{\{from\}\}/);
});

test('list item templates are validated', () => {
  const yaml = `
reports:
  - id: r1
    title: T
    sections:
      - { type: list, title: L, query: SELECT 1, item: "{a|bogus}" }
`;
  assert.throws(() => parseReportsConfig(yaml), /unknown format "\|bogus"/);
});

test('periods: shift and placeholder substitution', () => {
  assert.deepEqual(parseShift('7 days'), { amount: 7, unit: 'DAY' });
  assert.throws(() => parseShift('1 YEAR'));
  const lastWeek = shiftRange(PERIODS.today, '7 DAY');
  assert.deepEqual(lastWeek, { from: '(CURDATE()) - INTERVAL 7 DAY', to: '(NOW()) - INTERVAL 7 DAY' });
  assert.equal(
    applyRange('x >= {{from}} AND x < {{to}}', PERIODS.yesterday),
    'x >= (CURDATE() - INTERVAL 1 DAY) AND x < (CURDATE())',
  );
});
