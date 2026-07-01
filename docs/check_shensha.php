<?php
/**
 * 八字神煞验证脚本:
 * - 年柱触发但日柱不触发
 * - 日柱触发但年柱不触发
 * - 月柱/时柱触发
 * - 同一神煞多来源触发
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

function trigger_count($ss, $name, $triggerPillar){
    $n = 0;
    foreach($ss['items'] as $item){
        if($item['name'] != $name){
            continue;
        }
        foreach($item['hits'] as $hit){
            if($hit['trigger_pillar'] == $triggerPillar){
                $n++;
            }
        }
    }
    return $n;
}

$cases = [
    [
        'name' => '年柱触发但日柱不触发(驿马)',
        'tg' => [0, 2, 1, 3],
        'dz' => [0, 1, 7, 2], // 年支子->驿马寅命中; 日支未->驿马巳未命中
        'check' => function($ss){
            return has_trigger($ss, '驿马', 0) && !has_trigger($ss, '驿马', 2);
        }
    ],
    [
        'name' => '日柱触发但年柱不触发(驿马)',
        'tg' => [0, 2, 0, 3],
        'dz' => [1, 2, 0, 6], // 日支子->驿马寅命中; 年支丑->驿马亥未命中
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
];

$failed = 0;
foreach($cases as $case){
    $ss = $p->GetShensha($case['tg'], $case['dz']);
    $ok = $case['check']($ss);
    echo ($ok ? '[PASS] ' : '[FAIL] ') . $case['name'] . "\n";
    if(!$ok){
        $failed++;
    }
}

if($failed > 0){
    echo "共失败 {$failed} 项\n";
    exit(1);
}
echo "全部验证通过\n";
