#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

global.window = global;
global.__paipanShenshaConfigUrl = path.join(__dirname, '../lib/shensha_rules.json');
require(path.join(__dirname, '../js/shensha.js'));
require(path.join(__dirname, '../js/paipan.js'));

const engine = global.PaipanShensha;
const p = global.p;
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'shensha_test_vectors.json'), 'utf8'));

function normalize(result) {
  return {
    ruleset: result.ruleset,
    lines: result.lines,
    pillar_status: result.pillar_status.map((item) => ({
      pillar: item.pillar,
      calculated: item.calculated,
      hit_count: item.hit_count,
      hit_names: item.hit_names
    })),
    items: result.items.map((item) => ({
      name: item.name,
      rule_ids: item.rule_ids,
      empty_targets: item.empty_targets || null,
      day_gz: item.day_gz || null,
      hits: item.hits.map((hit) => ({
        rule_id: hit.rule_id,
        source_pillar: hit.source_pillar,
        source_type: hit.source_type,
        source_value: hit.source_value,
        target_pillar: hit.target_pillar,
        target_type: hit.target_type,
        target_value: hit.target_value,
        pair_match: hit.pair_match || null,
        lookup_variant: hit.lookup_variant || null,
        mode: hit.mode || null,
        direction: hit.direction || null
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }))
  };
}

const output = vectors.map((vector) => ({
  name: vector.name,
  result: normalize(engine.compute({ tg: vector.tg, dz: vector.dz }, p, { gender: vector.gender }))
}));

process.stdout.write(JSON.stringify(output, null, 2));
