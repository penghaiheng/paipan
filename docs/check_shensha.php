<?php
/**
 * 八字神煞验证脚本:
 * - 原有神煞: 天乙贵人/文昌贵人/羊刃/驿马/桃花/将星/华盖/劫煞/空亡/魁罡
 * - 新增神煞: 福星贵人/太极贵人/天德贵人/月德贵人/天德合/月德合/禄神/金舆/
 *             红鸾/天喜/孤辰/寡宿/亡神/灾煞/天医/元辰/天罗/地网
 * - 覆盖: 年干/年支/月支/日干/日支/日柱/三合组等不同触发来源
 * - 同一神煞多来源命中: 显示去重但明细保留依据
 *
 * 用法: php docs/check_shensha.php
 */
if(php_sapi_name() !== 'cli'){
    die("请在 CLI 下执行: php docs/check_shensha.php\n");
}

include(__DIR__ . '/../lib/class.paipan.php');
$p = new paipan();

function has_trigger($ss, $name, $triggerPillar){
    foreach($ss['items'] as $item){
        if($item['name'] != $name){
            continue;
        }
        foreach($item['hits'] as $hit){
            if($hit['trigger_pillar'] == $triggerPillar){
                return true;
            }
        }
    }
    return false;
}

function has_hit_pillar($ss, $name, $targetPillar){
    foreach($ss['items'] as $item){
        if($item['name'] != $name) continue;
        foreach($item['hits'] as $hit){
            if($hit['target_pillar'] == $targetPillar) return true;
        }
    }
    return false;
}

function trigger_count($ss, $name, $triggerPillar){
    $n = 0;
    foreach($ss['items'] as $item){
        if($item['name'] != $name) continue;
        foreach($item['hits'] as $hit){
            if($hit['trigger_pillar'] == $triggerPillar) $n++;
        }
    }
    return $n;
}

function check_pillar_lines($lines){
    $prefixes = ['年柱：', '月柱：', '日柱：', '时柱：'];
    if(count($lines) !== 4){
        return false;
    }
    foreach($prefixes as $i => $prefix){
        if(strpos($lines[$i], $prefix) !== 0){
            return false;
        }
        $body = trim(substr($lines[$i], strlen($prefix)));
        if($body === ''){
            return false;
        }
        if($body === '无'){
            continue;
        }
        $names = preg_split('/\s+/', $body);
        if(count($names) !== count(array_unique($names))){
            return false;
        }
    }
    return true;
}

// ===== 测试用例 =====
$cases = [
    // ---- 原有神煞 ----
    [
        'name' => '年柱触发但日柱不触发(驿马)',
        'tg' => [0, 2, 1, 3],
        'dz' => [0, 1, 7, 2], // 年支子->驿马寅; 日支未->驿马巳,无巳
        'check' => function($ss){
            return has_trigger($ss, '驿马', 0) && !has_trigger($ss, '驿马', 2);
        }
    ],
    [
        'name' => '日柱触发但年柱不触发(驿马)',
        'tg' => [0, 2, 0, 3],
        'dz' => [1, 2, 0, 6], // 日支子->驿马寅命中月柱; 年支丑->驿马亥,无亥
        'check' => function($ss){
            return has_trigger($ss, '驿马', 2) && !has_trigger($ss, '驿马', 0);
        }
    ],
    [
        'name' => '月柱与时柱可触发(桃花)',
        'tg' => [0, 2, 0, 3],
        'dz' => [9, 8, 0, 11], // 月支申->桃花酉(年柱酉命中); 时支亥->桃花子(日柱子命中)
        'check' => function($ss){
            return has_trigger($ss, '桃花(咸池)', 1) && has_trigger($ss, '桃花(咸池)', 3);
        }
    ],
    [
        'name' => '同一神煞多基准触发不丢依据(驿马)',
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 5, 0, 2], // 年支子与日支子都应触发驿马寅(时柱寅命中)
        'check' => function($ss){
            return trigger_count($ss, '驿马', 0) > 0 && trigger_count($ss, '驿马', 2) > 0;
        }
    ],
    [
        'name' => '神煞文本按四柱固定顺序展示并去重',
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 5, 0, 2], // 驿马由年/日重复触发, 时柱文本仍应只出现一次驿马
        'check' => function($ss){
            if(!check_pillar_lines($ss['lines'])){
                return false;
            }
            return substr_count($ss['lines'][3], '驿马') <= 1;
        }
    ],
    [
        'name' => '空亡(日柱甲子旬,戌亥空亡)',
        // 甲子日(dgz=0), 旬空=戌(10)亥(11)
        'tg' => [0, 2, 0, 3],
        'dz' => [10, 5, 0, 11], // 年支戌,时支亥,日柱甲子
        'check' => function($ss){
            return has_hit_pillar($ss, '空亡', 0) && has_hit_pillar($ss, '空亡', 3);
        }
    ],
    [
        'name' => '魁罡(庚辰日)',
        // 庚辰日柱 tg=6,dz=4 -> GZ=(10+6-4)/2*12+4=(12)/2*12+4=16
        'tg' => [0, 2, 6, 3],
        'dz' => [0, 2, 4, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '魁罡', 2);
        }
    ],

    // ---- 日干起算新神煞 ----
    [
        'name' => '禄神(甲日干->寅,月支寅命中)',
        // 甲日干->寅(2). 月支寅(2)命中月柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '禄神', 1) && has_trigger($ss, '禄神', 2);
        }
    ],
    [
        'name' => '太极贵人(甲日干->子午,年/时命中)',
        // 甲日干->子(0)午(6). 年支子(0)+时支午(6)
        'tg' => [0, 2, 0, 8],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '太极贵人', 0) && has_hit_pillar($ss, '太极贵人', 3);
        }
    ],
    [
        'name' => '金舆(甲日干->辰,日支辰命中)',
        // 甲日干->辰(4). 日支辰(4)命中日柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 4, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '金舆', 2);
        }
    ],

    // ---- 年干起算新神煞 ----
    [
        'name' => '福星贵人(甲年干->寅,月支寅命中)',
        // 年干甲(0)->寅(2). 月支寅(2)命中月柱
        'tg' => [0, 2, 8, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '福星贵人', 1) && has_trigger($ss, '福星贵人', 0);
        }
    ],

    // ---- 月支起算新神煞 ----
    [
        'name' => '月德贵人(月支寅->丙,月干丙命中月柱)',
        // 月支寅(2)->月德=丙(2). 月干丙(2)命中月柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '月德贵人', 1);
        }
    ],
    [
        'name' => '天德贵人(月支寅->丁干,时干丁命中时柱)',
        // 月支寅(2)->天德=丁(tg3). 时干丁(3)命中时柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 9],
        'check' => function($ss){
            return has_hit_pillar($ss, '天德贵人', 3);
        }
    ],
    [
        'name' => '天德合(月支寅->壬干,年干壬命中年柱)',
        // 月支寅(2)->天德丁->天德合=壬(tg8). 年干壬(8)命中年柱
        'tg' => [8, 2, 0, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '天德合', 0);
        }
    ],
    [
        'name' => '月德合(月支寅->辛干,时干辛命中时柱)',
        // 月支寅(2)->月德丙->月德合=辛(tg7). 时干辛(7)命中时柱
        'tg' => [0, 2, 0, 7],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '月德合', 3);
        }
    ],
    [
        'name' => '天医(月支子->亥,年支亥命中年柱)',
        // 月支子(0)->天医=(0-1+12)%12=11(亥). 年支亥(11)命中年柱
        'tg' => [0, 8, 0, 3],
        'dz' => [11, 0, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '天医', 0) && has_trigger($ss, '天医', 1);
        }
    ],
    [
        'name' => '天德贵人(月支子->巳地支,年支巳命中年柱)',
        // 月支子(0)->天德=巳(dz5). 年支巳(5)命中年柱
        'tg' => [0, 8, 0, 3],
        'dz' => [5, 0, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '天德贵人', 0) && has_trigger($ss, '天德贵人', 1);
        }
    ],

    // ---- 年支起算新神煞 ----
    [
        'name' => '红鸾(年支午->酉,日支酉命中日柱)',
        // 年支午(6)->红鸾=(3-6+12)%12=9(酉). 日支酉(9)命中日柱
        'tg' => [0, 2, 0, 3],
        'dz' => [6, 2, 9, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '红鸾', 2) && has_trigger($ss, '红鸾', 0);
        }
    ],
    [
        'name' => '天喜(年支午->卯,月支卯命中月柱)',
        // 年支午(6)->天喜=(9-6+12)%12=3(卯). 月支卯(3)命中月柱
        'tg' => [0, 2, 0, 3],
        'dz' => [6, 3, 9, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '天喜', 1) && has_trigger($ss, '天喜', 0);
        }
    ],
    [
        'name' => '孤辰(年支子->寅,月支寅命中月柱)',
        // 年支子(0)->孤辰=寅(2). 月支寅(2)命中月柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '孤辰', 1) && has_trigger($ss, '孤辰', 0);
        }
    ],
    [
        'name' => '寡宿(年支子->戌,年支本身为戌不命中;改用年支寅->丑)',
        // 年支寅(2)->寡宿=丑(1). 月支丑(1)命中月柱
        'tg' => [0, 2, 0, 3],
        'dz' => [2, 1, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '寡宿', 1) && has_trigger($ss, '寡宿', 0);
        }
    ],

    // ---- 三合组新神煞 ----
    [
        'name' => '亡神(年支子辰申->巳,时支巳命中时柱)',
        // 年支子(0) group0->亡神=巳(5). 时支巳(5)命中时柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 5],
        'check' => function($ss){
            return has_hit_pillar($ss, '亡神', 3) && has_trigger($ss, '亡神', 0);
        }
    ],
    [
        'name' => '灾煞(年支子辰申->午,时支午命中时柱)',
        // 年支子(0) group0->灾煞=午(6). 时支午(6)命中时柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 6],
        'check' => function($ss){
            return has_hit_pillar($ss, '灾煞', 3) && has_trigger($ss, '灾煞', 0);
        }
    ],

    // ---- 日支起算新神煞 ----
    [
        'name' => '元辰(日支子->未,时支未命中时柱)',
        // 日支子(0)->元辰=(0+7)%12=7(未). 时支未(7)命中时柱
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 7],
        'check' => function($ss){
            return has_hit_pillar($ss, '元辰', 3) && has_trigger($ss, '元辰', 2);
        }
    ],

    // ---- 地支自身神煞 ----
    [
        'name' => '天罗(年支亥命中年柱)',
        'tg' => [0, 2, 0, 3],
        'dz' => [11, 2, 0, 6], // 年支亥(11)=天罗
        'check' => function($ss){
            return has_hit_pillar($ss, '天罗', 0);
        }
    ],
    [
        'name' => '天罗(时支戌命中时柱)',
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 0, 10], // 时支戌(10)=天罗
        'check' => function($ss){
            return has_hit_pillar($ss, '天罗', 3);
        }
    ],
    [
        'name' => '地网(月支辰命中月柱)',
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 4, 0, 6], // 月支辰(4)=地网
        'check' => function($ss){
            return has_hit_pillar($ss, '地网', 1);
        }
    ],
    [
        'name' => '地网(日支巳命中日柱)',
        'tg' => [0, 2, 0, 3],
        'dz' => [0, 2, 5, 6], // 日支巳(5)=地网
        'check' => function($ss){
            return has_hit_pillar($ss, '地网', 2);
        }
    ],
];

$failed = 0;
foreach($cases as $case){
    $ss = $p->GetShensha($case['tg'], $case['dz']);
    $ok = $case['check']($ss);
    echo ($ok ? '[PASS] ' : '[FAIL] ') . $case['name'] . "\n";
    if(!$ok){
        $failed++;
        // 输出调试信息
        echo "  八字干: " . implode(' ', array_map(fn($v) => $p->ctg[$v], $case['tg'])) . "\n";
        echo "  八字支: " . implode(' ', array_map(fn($v) => $p->cdz[$v], $case['dz'])) . "\n";
        echo "  神煞输出:\n";
        foreach($ss['lines'] as $line) echo "    $line\n";
    }
}

echo "\n";
if($failed > 0){
    echo "共失败 {$failed} 项\n";
    exit(1);
}
echo "全部验证通过\n";

// ===== 完整八字样例输出 =====
echo "\n====== 完整八字样例输出 ======\n";
$samples = [
    ['label'=>'甲子年 丙寅月 甲子日 壬午时', 'tg'=>[0,2,0,8], 'dz'=>[0,2,0,6]],
    ['label'=>'辛亥年 壬子月 庚辰日 己卯时', 'tg'=>[7,8,6,4], 'dz'=>[11,0,4,3]],
    ['label'=>'甲午年 丁卯月 甲寅日 丁酉时', 'tg'=>[0,3,0,3], 'dz'=>[6,3,2,9]],
    ['label'=>'癸巳年 甲午月 壬辰日 辛亥时', 'tg'=>[9,0,8,7], 'dz'=>[5,6,4,11]],
];
foreach($samples as $s){
    $ss = $p->GetShensha($s['tg'], $s['dz']);
    echo "\n{$s['label']}:\n";
    foreach($ss['lines'] as $line) echo "  $line\n";
}
