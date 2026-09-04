<?php
/**
 * 神煞规则校验脚本
 * - 审计共享规则配置 lib/shensha_rules.json
 * - 覆盖全部查表键值的命中/不命中
 * - 校验重复命中去重但保留多触发依据、空亡六旬、魁罡、节气边界、2027-01-07 10:00 男命
 * - 校验 PHP/JS 使用同一组测试向量时输出一致
 *
 * 用法: php docs/check_shensha.php
 */
if (php_sapi_name() !== 'cli') {
    die("请在 CLI 下执行: php docs/check_shensha.php\n");
}
error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE);

include __DIR__ . '/../lib/class.paipan.php';
$p = new paipan();
$config = json_decode(file_get_contents(__DIR__ . '/../lib/shensha_rules.json'), true);
$ruleById = [];
foreach ($config['rules'] as $rule) {
    $ruleById[$rule['id']] = $rule;
}

$failed = 0;

function report_case($ok, $label, $detail = '') {
    global $failed;
    echo ($ok ? '[PASS] ' : '[FAIL] ') . $label . "\n";
    if (!$ok) {
        $failed++;
        if ($detail !== '') {
            foreach (explode("\n", trim($detail)) as $line) {
                if ($line !== '') {
                    echo '  ' . $line . "\n";
                }
            }
        }
    }
}

function other_value($max, $forbidden) {
    $forbidden = array_flip(array_map('intval', (array)$forbidden));
    for ($i = 0; $i < $max; $i++) {
        if (!isset($forbidden[$i])) {
            return $i;
        }
    }
    return 0;
}

function find_hits($ss, $ruleId, $targetPillar = null, $targetValue = null, $sourcePillar = null) {
    $hits = [];
    foreach ($ss['items'] as $item) {
        foreach ($item['hits'] as $hit) {
            if ($hit['rule_id'] !== $ruleId) {
                continue;
            }
            if ($targetPillar !== null && $hit['target_pillar'] !== $targetPillar) {
                continue;
            }
            if ($targetValue !== null && $hit['target_value'] !== $targetValue) {
                continue;
            }
            if ($sourcePillar !== null && $hit['source_pillar'] !== $sourcePillar) {
                continue;
            }
            $hits[] = $hit;
        }
    }
    return $hits;
}

function normalize_result($ss) {
    $items = [];
    foreach ($ss['items'] as $item) {
        $hits = [];
        foreach ($item['hits'] as $hit) {
            $hits[] = [
                'rule_id' => $hit['rule_id'],
                'source_pillar' => $hit['source_pillar'],
                'source_type' => $hit['source_type'],
                'source_value' => $hit['source_value'],
                'target_pillar' => $hit['target_pillar'],
                'target_type' => $hit['target_type'],
                'target_value' => $hit['target_value'],
                'pair_match' => $hit['pair_match'] ?? null,
                'lookup_variant' => $hit['lookup_variant'] ?? null,
                'mode' => $hit['mode'] ?? null,
                'direction' => $hit['direction'] ?? null,
            ];
        }
        usort($hits, fn($a, $b) => strcmp(json_encode($a, JSON_UNESCAPED_UNICODE), json_encode($b, JSON_UNESCAPED_UNICODE)));
        $items[] = [
            'name' => $item['name'],
            'rule_ids' => $item['rule_ids'],
            'empty_targets' => $item['empty_targets'] ?? null,
            'day_gz' => $item['day_gz'] ?? null,
            'hits' => $hits,
        ];
    }
    return [
        'ruleset' => $ss['ruleset'],
        'lines' => $ss['lines'],
        'pillar_status' => array_map(fn($item) => [
            'pillar' => $item['pillar'],
            'calculated' => $item['calculated'],
            'hit_count' => $item['hit_count'],
            'hit_names' => $item['hit_names'],
        ], $ss['pillar_status']),
        'items' => $items,
    ];
}

function compute_ss($p, $tg, $dz, $options = []) {
    return $p->GetShensha($tg, $dz, $options + ['gender' => 0]);
}

foreach ($config['rules'] as $rule) {
    switch ($rule['rule_type']) {
        case 'day_gan_lookup':
            foreach ($rule['lookup'] as $stem => $targets) {
                $tg = [other_value(10, []), other_value(10, []), intval($stem), other_value(10, [])];
                $neutral = other_value(12, $targets);
                $dz = [$neutral, $neutral, $neutral, $neutral];
                foreach ($targets as $target) {
                    $dz[0] = $target;
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], 0, $target, 2)) > 0, $rule['id'] . " 命中 dayGan={$stem} target={$target}");
                    $dz[0] = other_value(12, $targets);
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], 0, null, 2)) === 0, $rule['id'] . " 不命中 dayGan={$stem}");
                }
            }
            break;
        case 'day_gan_lookup_variant':
            foreach ($rule['lookup_variants']['common'] as $stem => $targets) {
                $neutral = other_value(12, $targets);
                $dz = [$neutral, $neutral, $neutral, $neutral];
                $tg = [0, 1, intval($stem), 3];
                foreach ($targets as $target) {
                    $dz[0] = $target;
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0, 'taiji_mode' => 'common']);
                    report_case(count(find_hits($ss, $rule['id'], 0, $target, 2)) > 0, $rule['id'] . " common 命中 stem={$stem} target={$target}");
                    $dz[0] = $neutral;
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0, 'taiji_mode' => 'common']);
                    report_case(count(find_hits($ss, $rule['id'], 0, null, 2)) === 0, $rule['id'] . " common 不命中 stem={$stem}");
                }
            }
            break;
        case 'year_gan_lookup_variant':
            foreach ($rule['lookup_variants']['common_dual_target'] as $stem => $targets) {
                $neutral = other_value(12, $targets);
                $dz = [$neutral, $neutral, $neutral, $neutral];
                $tg = [intval($stem), 1, 2, 3];
                foreach ($targets as $target) {
                    $dz[2] = $target;
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0, 'fuxing_mode' => 'common_dual_target']);
                    report_case(count(find_hits($ss, $rule['id'], 2, $target, 0)) > 0, $rule['id'] . " 命中 stem={$stem} target={$target}");
                    $dz[2] = $neutral;
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0, 'fuxing_mode' => 'common_dual_target']);
                    report_case(count(find_hits($ss, $rule['id'], 2, null, 0)) === 0, $rule['id'] . " 不命中 stem={$stem}");
                }
            }
            break;
        case 'month_zhi_lookup_mixed':
            foreach ($rule['lookup'] as $monthZhi => $target) {
                $tg = [0, 1, 2, 3];
                $dz = [other_value(12, [$monthZhi, $target['value']]), intval($monthZhi), other_value(12, [$target['value']]), other_value(12, [$target['value']])];
                if ($target['type'] === 'tg') {
                    $tg[0] = $target['value'];
                } else {
                    $dz[0] = $target['value'];
                }
                $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 0, $target['value'], 1)) > 0, $rule['id'] . " 命中 monthZhi={$monthZhi}");
                if ($target['type'] === 'tg') {
                    $tg[0] = other_value(10, [$target['value']]);
                } else {
                    $dz[0] = other_value(12, [$target['value']]);
                }
                $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 0, null, 1)) === 0, $rule['id'] . " 不命中 monthZhi={$monthZhi}");
            }
            break;
        case 'month_zhi_lookup':
            foreach ($rule['lookup'] as $monthZhi => $targets) {
                foreach ($targets as $target) {
                    $tg = [other_value(10, [$target]), 1, 2, 3];
                    $dz = [other_value(12, [$target]), intval($monthZhi), other_value(12, [$target]), other_value(12, [$target])];
                    if ($rule['target_value_type'] === 'tg') {
                        $tg[3] = $target;
                        $targetPillar = 3;
                    } else {
                        $dz[3] = $target;
                        $targetPillar = 3;
                    }
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], $targetPillar, $target, 1)) > 0, $rule['id'] . " 命中 monthZhi={$monthZhi} target={$target}");
                    if ($rule['target_value_type'] === 'tg') {
                        $tg[3] = other_value(10, [$target]);
                    } else {
                        $dz[3] = other_value(12, [$target]);
                    }
                    $ss = compute_ss($p, $tg, $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], $targetPillar, null, 1)) === 0, $rule['id'] . " 不命中 monthZhi={$monthZhi}");
                }
            }
            break;
        case 'month_zhi_formula_previous_branch':
            for ($monthZhi = 0; $monthZhi < 12; $monthZhi++) {
                $target = ($monthZhi + 11) % 12;
                $dz = [$target, $monthZhi, other_value(12, [$target]), other_value(12, [$target])];
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 0, $target, 1)) > 0, $rule['id'] . " 命中 monthZhi={$monthZhi}");
                $dz[0] = other_value(12, [$target]);
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 0, null, 1)) === 0, $rule['id'] . " 不命中 monthZhi={$monthZhi}");
            }
            break;
        case 'year_zhi_formula_offset':
            for ($yearZhi = 0; $yearZhi < 12; $yearZhi++) {
                $target = strpos($rule['offset_formula'], '9-') === 0 ? (9 - $yearZhi + 12) % 12 : (3 - $yearZhi + 12) % 12;
                $dz = [$yearZhi, other_value(12, [$target]), $target, other_value(12, [$target])];
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 2, $target, 0)) > 0, $rule['id'] . " 命中 yearZhi={$yearZhi}");
                $dz[2] = other_value(12, [$target]);
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 2, null, 0)) === 0, $rule['id'] . " 不命中 yearZhi={$yearZhi}");
            }
            break;
        case 'year_zhi_lookup':
            foreach ($rule['lookup'] as $yearZhi => $targets) {
                foreach ($targets as $target) {
                    $dz = [$yearZhi, other_value(12, [$target]), other_value(12, [$target]), $target];
                    $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], 3, $target, 0)) > 0, $rule['id'] . " 命中 yearZhi={$yearZhi} target={$target}");
                    $dz[3] = other_value(12, [$target]);
                    $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                    report_case(count(find_hits($ss, $rule['id'], 3, null, 0)) === 0, $rule['id'] . " 不命中 yearZhi={$yearZhi}");
                }
            }
            break;
        case 'tri_group_lookup':
            for ($sourceBranch = 0; $sourceBranch < 12; $sourceBranch++) {
                $group = $rule['groups'][$sourceBranch];
                $target = $rule['lookup'][$group];
                $neutral = other_value(12, [$sourceBranch, $target]);
                $dz = [$sourceBranch, $neutral, $neutral, $target];
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 3, $target, 0)) > 0, $rule['id'] . " 命中 sourceBranch={$sourceBranch}");
                $dz[3] = $neutral;
                $ss = compute_ss($p, [0, 1, 2, 3], $dz, ['gender' => 0]);
                report_case(count(find_hits($ss, $rule['id'], 3, null, 0)) === 0, $rule['id'] . " 不命中 sourceBranch={$sourceBranch}");
            }
            break;
    }
}

// 元辰默认口径与兼容口径
for ($yearZhi = 0; $yearZhi < 12; $yearZhi++) {
    $target = ($yearZhi + 5) % 12; // 阳男，丙甲等阳年干
    $dz = [$yearZhi, $target, other_value(12, [$target]), other_value(12, [$target])];
    $ss = $p->GetShensha([0, 1, 2, 3], $dz, ['gender' => 0]);
    report_case(count(find_hits($ss, 'year_branch.yuanchen', 1, $target, 0)) > 0, "year_branch.yuanchen 默认命中 yearZhi={$yearZhi}");
    $dz[1] = other_value(12, [$target]);
    $ss = $p->GetShensha([0, 1, 2, 3], $dz, ['gender' => 0]);
    report_case(count(find_hits($ss, 'year_branch.yuanchen', 1, null, 0)) === 0, "year_branch.yuanchen 默认不命中 yearZhi={$yearZhi}");
}
$legacyYuanchen = $p->GetShensha([0, 1, 0, 3], [0, 2, 0, 7], ['ruleset' => 'paipan_legacy_compat', 'gender' => 0]);
report_case(count(find_hits($legacyYuanchen, 'year_branch.yuanchen', 3, 7, 2)) > 0, 'year_branch.yuanchen 旧版兼容(日支+7仅查时支)');

// 天罗地网默认需成对，旧版兼容单支
$pairedTianluo = $p->GetShensha([0, 1, 2, 3], [10, 1, 11, 3], ['gender' => 0]);
report_case(count(find_hits($pairedTianluo, 'paired.tianluo')) === 2, 'paired.tianluo 默认戌亥互见才成立');
$singleTianluo = $p->GetShensha([0, 1, 2, 3], [10, 1, 2, 3], ['gender' => 0]);
report_case(count(find_hits($singleTianluo, 'paired.tianluo')) === 0, 'paired.tianluo 单见戌不成立');
$legacyTianluo = $p->GetShensha([0, 1, 2, 3], [10, 1, 2, 3], ['ruleset' => 'paipan_legacy_compat', 'gender' => 0]);
report_case(count(find_hits($legacyTianluo, 'paired.tianluo', 0, 10, 0)) === 1, 'paired.tianluo 旧版兼容单支');
$pairedDiwang = $p->GetShensha([0, 1, 2, 3], [4, 1, 5, 3], ['gender' => 0]);
report_case(count(find_hits($pairedDiwang, 'paired.diwang')) === 2, 'paired.diwang 默认辰巳互见才成立');
$singleDiwang = $p->GetShensha([0, 1, 2, 3], [4, 1, 2, 3], ['gender' => 0]);
report_case(count(find_hits($singleDiwang, 'paired.diwang')) === 0, 'paired.diwang 单见辰不成立');

// 六旬空亡全覆盖
$xunkongDays = [
    0 => [0, 0],   // 甲子
    10 => [0, 10], // 甲戌
    20 => [0, 8],  // 甲申
    30 => [0, 6],  // 甲午
    40 => [0, 4],  // 甲辰
    50 => [0, 2],  // 甲寅
];
foreach ($xunkongDays as $dayGz => [$dayTg, $dayDz]) {
    $targets = $ruleById['day_gz.xunkong']['lookup'][intval(floor($dayGz / 10))];
    $dz = [$targets[0], other_value(12, $targets), $dayDz, other_value(12, $targets)];
    $tg = [0, 1, $dayTg, 3];
    $ss = $p->GetShensha($tg, $dz, ['gender' => 0]);
    report_case(count(find_hits($ss, 'day_gz.xunkong', 0, $targets[0], 2)) > 0, "day_gz.xunkong 命中 dayGz={$dayGz}");
    $dz[0] = other_value(12, $targets);
    $ss = $p->GetShensha($tg, $dz, ['gender' => 0]);
    report_case(count(find_hits($ss, 'day_gz.xunkong', 0, null, 2)) === 0, "day_gz.xunkong 不命中 dayGz={$dayGz}");
}

// 魁罡四日与非魁罡
foreach ([[6,4,16],[8,4,28],[6,10,46],[8,10,58]] as [$tgDay, $dzDay, $dayGz]) {
    $ss = $p->GetShensha([0, 1, $tgDay, 3], [0, 2, $dzDay, 6], ['gender' => 0]);
    report_case(count(find_hits($ss, 'day_gz.kuigang', 2, $dayGz, 2)) > 0, "day_gz.kuigang 命中 {$dayGz}");
}
$notKuigang = $p->GetShensha([0, 1, 0, 3], [0, 2, 0, 6], ['gender' => 0]);
report_case(count(find_hits($notKuigang, 'day_gz.kuigang')) === 0, 'day_gz.kuigang 非魁罡不命中');

// 重复命中去重但保留多触发依据
$dup = $p->GetShensha([0, 2, 0, 3], [0, 5, 0, 2], ['gender' => 0]);
$yimaHits = find_hits($dup, 'group.yima', 3, 2);
report_case(count($yimaHits) === 2, 'group.yima 同一落点保留年支/日支双重触发依据');
report_case(substr_count($dup['lines'][3], '驿马') === 1, 'lines 兼容展示对重复命中去重');

// 2027-01-07 10:00 男命端到端
$fm = $p->fatemaps(0, 2027, 1, 7, 10, 0, 0);
report_case($fm['sz'] === ['丙午', '辛丑', '丙戌', '癸巳'], '2027-01-07 10:00 男命四柱回归');
report_case(count($fm['shensha_pillar_status']) === 4 && array_reduce($fm['shensha_pillar_status'], fn($carry, $item) => $carry && $item['calculated'], true), '2027-01-07 10:00 四柱神煞均标记已计算');
report_case(isset($fm['shensha_pillar_status'][1]) && $fm['shensha_pillar_status'][1]['source_rule_count'] > 0, '2027-01-07 10:00 月柱作为触发来源已计算');
report_case(isset($fm['shensha_pillar_status'][1]) && is_array($fm['shensha_pillar_status'][1]['hit_names']), '2027-01-07 10:00 月柱状态结构存在');
report_case($fm['shensha_ruleset'] === 'paipan_v2_default', '2027-01-07 10:00 使用默认审计规则集');

// 节气月边界前后仍能完成神煞计算
$times = [
    'before' => [2027, 2, 3, 23, 59, 59],
    'after' => [2027, 2, 4, 0, 0, 1],
];
foreach ($times as $label => $parts) {
    $fmEdge = $p->fatemaps(0, $parts[0], $parts[1], $parts[2], $parts[3], $parts[4], $parts[5]);
    report_case(count($fmEdge['shensha_pillar_status']) === 4, "节气边界 {$label} 神煞状态完整");
    report_case(isset($fmEdge['shensha_by_source_pillar'][1]), "节气边界 {$label} 月柱来源结构存在");
}

// PHP / JS 共享测试向量一致
$vectorFile = __DIR__ . '/shensha_test_vectors.json';
$vectors = json_decode(file_get_contents($vectorFile), true);
$phpParity = [];
foreach ($vectors as $vector) {
    $phpParity[$vector['name']] = normalize_result($p->GetShensha($vector['tg'], $vector['dz'], ['gender' => $vector['gender']]));
}
$jsOutput = shell_exec('node ' . escapeshellarg(__DIR__ . '/check_shensha_js.js'));
$jsParity = json_decode($jsOutput, true);
$jsMap = [];
foreach ((array)$jsParity as $entry) {
    $jsMap[$entry['name']] = $entry['result'];
}
foreach ($phpParity as $name => $normalized) {
    report_case(isset($jsMap[$name]) && $jsMap[$name] == $normalized, 'PHP/JS 一致性 ' . $name, isset($jsMap[$name]) ? '' : 'JS 输出缺少该向量');
}

if ($failed > 0) {
    echo "\n共失败 {$failed} 项\n";
    exit(1);
}

echo "\n全部验证通过\n";
