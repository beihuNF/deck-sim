# 冻结存档样本（游戏 v0.111.0 的网页版）

采集日期：2026-10-10。来自 `codex/public-beta-v0.111.0` 分支、基线 `7ed6661` 上未提交的升级工作区。
使用 S 构建的真实浏览器界面，原始 `user://` 文件逐字节导出；没有修改文件内容。
构建入口：`index-D90lLcDr.js`，SHA-256：`7acb060b2a15fc72b9449253ee30abefe2b10b71bf69d01dac111e14318fd4c9`。
游戏目标为本机 Steam public-beta v0.111.0 / 41cef1ea，Build ID 24724944。

**不要修改或重新生成这些样本。** 后续格式变化应新增版本目录；v0.98.3 的原样样本仍完整保留。

## 内容

- `ironclad-new-profile/`：全新档案（不带 `unlock=all`）的 `fresh`、`f6`、`f25`、`f41`、`postrun`。
- `silent/`、`regent/`、`necrobinder/`、`defect/`：带 `unlock=all` 的 `f6`、`f25`、`f41`、`postrun`；未收录这些开发解锁档案的 `fresh`。
- 各时间点同名 `.json` 是导出时浏览器读取的文件数、楼层、生命、金币、牌组/遗物数量及历史记录；测试直接对照这些事实。
- `enums.json` 用 `node tools/save-enums.mjs` 从这一版源码生成。

每局都通过保存并退出 → 刷新 → 继续，并完成三幕、胜利结算、历史记录和返回主菜单检查。
五局退出码均为 0，`RESULT WIN`，控制台 / 页面错误均为 0。
`GOD=2` 只把玩家生命恢复、敌人设为 1 HP，不改变存档结构。它用于采集三幕样本；另有五角色 `GOD=1 FULL=1` 整局验收。

## 采集命令

```bash
CHROME=<独立测试浏览器> URL=http://127.0.0.1:47174/ UNLOCK=0 GOD=2 FULL=1 FAST=1 VIEW=1280x720 SEED=E2EFINAL DUMP=<目录>/ironclad-new-profile node tools/e2e/play.mjs <输出> 12000
CHROME=<独立测试浏览器> URL=http://127.0.0.1:47174/ CHAR=2 LANG_UI=zhs GOD=2 FULL=1 FAST=1 VIEW=1280x720 SEED=E2ESILENT DUMP=<目录>/silent node tools/e2e/play.mjs <输出> 12000
# CHAR=3 regent（BETASAVE3）、CHAR=4 necrobinder（BETASAVE4）、CHAR=5 defect（BETASAVE5），其余选项同上，不设置 LANG_UI。
```

日志、原始完整导出和构建源码指纹保存在本机忽略目录 `_work/upgrades/v0.111.0/`。
采集后的 T 修正结束回合按钮显示编号；V 修正灾厄动画结束时的裁剪遮罩清理；W 禁用卡牌上的浏览器原生图片拖拽，并同步移植版日志。这些变化未改动存档序列化与规则层。
