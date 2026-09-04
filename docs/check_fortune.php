<?php
if (php_sapi_name() !== 'cli') {
    die("请在 CLI 下执行: php docs/check_fortune.php\n");
}
error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE);

include __DIR__ . '/../lib/class.paipan.php';
$p = new paipan();
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

function dt_to_list($dt){
    return [intval($dt['year']), intval($dt['month']), intval($dt['day']), intval($dt['hour']), intval($dt['minute']), intval($dt['second'])];
}

function plus_seconds($p, $dt, $seconds){
    $parts = dt_to_list($dt);
    $jd = $p->Jdays($parts[0], $parts[1], $parts[2], $parts[3], $parts[4], $parts[5]);
    return $p->Jtime($jd + $seconds / 86400);
}

function call_fortune($p, $parts, $opts = []) {
    return $p->GetFortunePillars($parts[0], $parts[1], $parts[2], $parts[3], $parts[4], $parts[5], $opts['longitude'] ?? null, $opts['latitude'] ?? null);
}

// 1) 流年立春边界前后（使用实际计算出的立春时刻 ±1s）
$seed = call_fortune($p, [2027, 2, 4, 12, 0, 0]);
$lichunStart = $seed['year_panel']['boundary']['start']['datetime'];
$before = plus_seconds($p, $lichunStart, -1);
$after = plus_seconds($p, $lichunStart, +1);
$rBefore = call_fortune($p, $before);
$rAfter = call_fortune($p, $after);
report_case($rBefore && $rAfter && $rBefore['year_panel']['pillar']['gz'] !== $rAfter['year_panel']['pillar']['gz'], '流年立春边界前后年柱不同');

// 2) 流月节气月映射（含小寒->立春）
$starts = [];
$cursor = $seed['month_panel']['boundary']['start']['datetime'];
for ($i = 0; $i < 12; $i++) {
    $startPlus = plus_seconds($p, $cursor, 1);
    $starts[] = $startPlus;
    $res = call_fortune($p, $startPlus);
    $cursor = $res['month_panel']['boundary']['next']['datetime'];
}
for ($m = 0; $m < 12; $m++) {
    $res = call_fortune($p, $starts[$m]);
    $expectDz = ($m + 2) % 12; // 寅起
    report_case($res && intval($res['month_panel']['pillar']['dz']) === $expectDz, "节气月映射 m={$m} 命中");
}
$seedJan = call_fortune($p, [2027, 1, 20, 12, 0, 0]);
$janDz = intval($seedJan['month_panel']['pillar']['dz']);
$seedLichun = call_fortune($p, plus_seconds($p, $lichunStart, 1));
$lichunDz = intval($seedLichun['month_panel']['pillar']['dz']);
report_case($janDz === 1, '小寒到立春之间为丑月');
report_case($lichunDz === 2, '立春后切换寅月');

// 3) 流日连续与 zwz 口径一致
$rDayA = call_fortune($p, [2027, 2, 5, 10, 0, 0]);
$rDayB = call_fortune($p, [2027, 2, 6, 10, 0, 0]);
$delta = (($rDayB['day_panel']['pillar']['gz'] - $rDayA['day_panel']['pillar']['gz']) + 60) % 60;
report_case($delta === 1, '相邻两日流日干支连续');

$p->zwz = true;
$rZwzTrue = call_fortune($p, [2027, 2, 5, 23, 0, 0]);
[$tgTrue, $dzTrue] = $p->GetGZ(2027, 2, 5, 23, 0, 0);
report_case($rZwzTrue['day_panel']['pillar']['tg'] === $tgTrue[2] && $rZwzTrue['day_panel']['pillar']['dz'] === $dzTrue[2], 'zwz=true 与 GetGZ 日界一致');
$p->zwz = false;
$rZwzFalse = call_fortune($p, [2027, 2, 5, 23, 0, 0]);
[$tgFalse, $dzFalse] = $p->GetGZ(2027, 2, 5, 23, 0, 0);
report_case($rZwzFalse['day_panel']['pillar']['tg'] === $tgFalse[2] && $rZwzFalse['day_panel']['pillar']['dz'] === $dzFalse[2], 'zwz=false 与 GetGZ 日界一致');
report_case($rZwzTrue['day_panel']['pillar']['gz'] !== $rZwzFalse['day_panel']['pillar']['gz'], 'zwz 开关影响 23:00 日柱');
$p->zwz = true;

// 4) 五虎遁：覆盖10个流年天干，验证寅月月干与顺推
$covered = [];
for ($y = 1900; $y <= 2100; $y++) {
    $res = call_fortune($p, [$y, 2, 10, 12, 0, 0]);
    if (!$res) continue;
    $stem = intval($res['year_panel']['pillar']['tg']);
    if (!isset($covered[$stem])) {
        $covered[$stem] = $res;
    }
    if (count($covered) === 10) break;
}
report_case(count($covered) === 10, '五虎遁覆盖10个流年天干');
foreach ($covered as $stem => $res) {
    report_case($res['month_panel']['wuhu_dun']['matches_getgz'] === true, "流年干 {$stem} 寅月月干与 GetGZ 一致");
    $nextDt = $res['month_panel']['boundary']['next']['datetime'];
    $nextRes = call_fortune($p, plus_seconds($p, $nextDt, 1));
    report_case($nextRes && $nextRes['month_panel']['wuhu_dun']['matches_getgz'] === true, "流年干 {$stem} 后续月干顺推一致");
}

// 5) 关系：年/月/日各至少一例并记录参与柱位
$fm = $p->fatemaps(0, 2027, 1, 7, 10, 0, 0);
$natalTg = $fm['tg'];
$natalDz = $fm['dz'];
$found = ['year_panel' => false, 'month_panel' => false, 'day_panel' => false];
for ($m = 1; $m <= 12; $m++) {
    for ($d = 1; $d <= 28; $d++) {
        $a = $p->AnalyzeFortuneAt($natalTg, $natalDz, 2027, $m, $d, 12, 0, 0);
        foreach ($found as $key => $ok) {
            if ($ok) continue;
            if (!empty($a[$key]['relations'])) {
                $first = $a[$key]['relations'][0];
                $found[$key] = isset($first['natal_pillars']) && count($first['natal_pillars']) > 0 && isset($first['target_pillar']);
            }
        }
        if ($found['year_panel'] && $found['month_panel'] && $found['day_panel']) {
            break 2;
        }
    }
}
foreach ($found as $key => $ok) {
    report_case($ok, $key . ' 存在关系且记录参与柱位');
}

// 6) transit 神煞边界：本次不启用跨组触发
$a = $p->AnalyzeFortuneAt($natalTg, $natalDz, 2027, 3, 1, 12, 0, 0);
foreach (['year_panel', 'month_panel', 'day_panel'] as $k) {
    report_case(isset($a[$k]['shensha']['supported']) && $a[$k]['shensha']['supported'] === false, $k . ' transit 神煞未启用');
}

// 7) 端到端结构
report_case(isset($a['year_panel']['pillar']) && isset($a['year_panel']['boundary']), 'AnalyzeFortuneAt 返回流年 panel 结构完整');
report_case(isset($a['month_panel']['pillar']) && isset($a['month_panel']['boundary']), 'AnalyzeFortuneAt 返回流月 panel 结构完整');
report_case(isset($a['day_panel']['pillar']) && isset($a['day_panel']['boundary']), 'AnalyzeFortuneAt 返回流日 panel 结构完整');

// 8) 共享测试向量（用于后续 PHP/JS 一致性扩展）
$vectors = json_decode(file_get_contents(__DIR__ . '/fortune_test_vectors.json'), true);
$vectorOk = is_array($vectors) && count($vectors) > 0;
report_case($vectorOk, '共享 fortune_test_vectors.json 可读取');
if ($vectorOk) {
    foreach ($vectors as $vector) {
        $t = $vector['target'];
        $res = $p->AnalyzeFortuneAt($vector['natal']['tg'], $vector['natal']['dz'], $t['year'], $t['month'], $t['day'], $t['hour'], $t['minute'], $t['second'], $vector['options'] ?? []);
        report_case(isset($res['year_panel']) && isset($res['month_panel']) && isset($res['day_panel']), '向量 ' . $vector['name'] . ' 计算成功');
    }
}

if ($failed > 0) {
    echo "\n共失败 {$failed} 项\n";
    exit(1);
}

echo "\n全部验证通过\n";
