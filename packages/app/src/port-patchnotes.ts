/** Web port updates, newest first. Add both languages here; original game notes remain in assets/patch_notes. */
export const portPatchNotes: { date: string; eng: string; zhs: string }[] = [
  {
    date: '2026_10_12',
    eng: `[gold][b]Multiplayer[/b][/gold]
• Fixed guest player WebSocket handshake being rejected (403) by correcting Steam ID identity validation for unauthenticated guest profiles.
• Fixed mobile multiplayer room creation showing "Connection lost or synchronization failed" error by enhancing same-origin verification to support Origin-less mobile requests, LAN IP debugging, and WebSocket handshakes, and increased room creation payload limit to 512KB.
• Fixed mobile Steam login instantly closing/flashing by transitioning touch and mobile devices to full-page authentication redirects with automatic lobby recovery, and guarded desktop popup dismissal on verified profiles.
• Restored co-op run save & resume functionality (1:1 aligned with original NMultiplayerLoadGameScreen, supporting resuming from save and discarding co-op runs).
• Added guest nickname system and in-lobby name editing with real-time room broadcast.
• Improved room invite link formatting with clean path-based short URLs (/r/CODE) to prevent link truncations on mobile messaging apps, and added one-tap clipboard room code auto-fill.
• Fixed unexpected "room full or already started" error during reconnection by preserving started run player slots and backing up session tokens in local storage.
• Aligned multiplayer lobby 1:1 with original character select screen (restored ReadyAndWaitingPanel nine-patch banner with thinky dots, red X UnreadyButton, and clean floating player nameplates).
• Added quick room reload (SL) for hosts to restart the current room or combat seamlessly, with button text aligned with singleplayer.
• Added independent remote teammate mouse cursors with smooth interpolation, drawing quills, eraser tools, and player tags.
• Restored event split vote wheel animation with tick sounds, teammate bouncing, and golden confirmation flashes.
• Fixed unexpected black screen fade when canceling or exiting multiplayer lobbies.
• Resolved Steam avatar resolution, added proxy acceleration, and refined profile sync.
• Restored co-op audio effects for map pings, split route votes, and combat pings.
• Added page lifecycle wake-up handlers (listening to visibilitychange and online events) to instantly reconnect when switching back from mobile background or sleep.
• Implemented smoothed round-trip ping tracking aligned with original NetQualityTracker specification, displaying real-time latency indicators in the lobby.
• Aligned waiting state 1:1 with authentic NCombatRoom %WaitingForOtherPlayers overlay (using fuzzy nine-patch banner and MULTIPLAYER_WAITING entry).
• Linked accidental page reloads with local multiplayer saves, offering seamless recovery guidance via the authentic NMultiplayerLoadGameScreen.

[gold][b]Visuals & Audio[/b][/gold]
• Fixed cursor WebP textures resolving to 404 under stylesheet subpaths by converting cursor URLs to absolute site paths.
• Fixed main menu background scene preload path resolving to 404 during boot.
• Restored missing status icons (HP, Gold, Floor) in the multiplayer save recovery panel using authentic atlas frames.
• Expanded audio fallback dictionary (SYN) to support full native playback for pause menus, map open/close/selection/erasing, and merchant voice effects.
• Fixed campfire sleep option icon mapping to accurately display original option_heal texture across all conditions.
• Aligned boot screen 1:1 with original NLogoAnimation (timing, logo drop, background color transition, and removed non-original hint texts).
• Integrated original hand-drawn cursor textures across the game and gamepad virtual cursor.
• Restored deck view close sound and fallback audio for opening act chests.
• Simulated rolling boulder sequence with impacts, screen shakes, and progressive damage timing.

[gold][b]Gameplay[/b][/gold]
• Aligned random character ascension selection with original StartRunLobby: fixed random character defaulting to ascension 10, properly respecting and saving preferred ascension level.
• Restored original top-left Profile Switcher button across the main menu and submenus, completely decoupling it from Steam account overlays. Steam account status is now cleanly hosted in an independent top-right badge in the multiplayer lobby.

[gold][b]Controls[/b][/gold]
• Aligned controller selection indicator with the original game's golden reticle corners and subtle highlights.`,
    zhs: `[gold][b]多人联机[/b][/gold]
• 修复游客身份创建多人房间时 WebSocket 握手失败被拒（403）的严重缺陷：修正套接字连接时对游客空 Steam ID 的校验逻辑。
• 修复移动端创建多人房间显示“连接中断或同步失败”的问题：完善同源安全校验机制，支持移动端无 Origin 同源请求、局域网真机调试及 WebSocket 握手协议，并放宽建房请求体上限至 512KB。
• 修复移动端点击“登录 Steam”弹窗闪退的问题：移动端与触控设备全面采用整页跳转认证流，登录后自动重定向返回多人大厅；桌面端增加登录状态校验，避免关闭窗口时误关账号设置界面。
• 恢复主菜单及各级大厅左上角为纯正原版切换存档按钮（显示存档编号与红底剑图标，点击切换 Profile），不受 Steam 账号登录影响。
• 多人联机身份与 Steam 账号管理移至大厅右上角独立徽章，互不干扰且操作更直观。
• 完整还原多人存档恢复与断点续玩机制（1:1 对齐原版 NMultiplayerLoadGameScreen 读档大厅，支持主菜单继续联机或放弃存档）。
• 新增游客自定义昵称系统与大厅铭牌实时改名广播，联机辨识更清晰。
• 优化移动端邀请链接格式为纯路径短链接（/r/房间码），彻底解决手机聊天软件截断域名后缀的问题，并支持加入房间时自动读取剪贴板智能填码。
• 修复重连时错误提示“房间已满或已开始”的问题：开局后永久保留玩家席位避免超时剔除，并支持本地持久化会话凭证恢复。
• 多人准备大厅 1:1 对齐原版角色选择界面：还原原版 ReadyAndWaitingPanel 毛边九宫格等待面板、UnreadyButton 取消就绪红叉按钮与纯净悬浮铭牌。
• 新增多人对局房主快速重开 (SL) 功能，按钮文案完全对齐单人统一为“快速SL”。
• 新增独立远程队友鼠标光标，支持平滑插值移动、地图羽毛笔/橡皮擦显示及队友标签。
• 还原多人事件分票摇奖轮盘动画、音效、头像弹跳及获胜金光闪烁。
• 修复多人菜单与房间大厅点击取消/退出时黑屏的问题，恢复原版即时返回。
• 修复 Steam 头像获取问题，提供边缘节点加速代理并支持自动更新补全。
• 补齐多人地图催促、分路投票及局内快捷 Ping 提示音效。
• 针对移动端切后台与息屏场景，接入页面生命周期即时唤醒（监听 visibilitychange 与 online 事件，切回前台瞬间秒级重连）。
• 遵循原版 NetQualityTracker 规范，实现平滑往返延迟（Ping）测算并在大厅实时展示网络延迟状态。
• 1:1 对齐原版 NCombatRoom %WaitingForOtherPlayers 局内等待队友重连原生遮罩（复用毛边九宫格与 MULTIPLAYER_WAITING 词条）。
• 局内意外刷新页面时智能联动本地多人存档，引导通过原版多人读档大厅（NMultiplayerLoadGameScreen）无缝恢复对局。

[gold][b]视听表现[/b][/gold]
• 修复鼠标指针贴图在生产环境下解析为 /js/assets/... 导致 404 的问题：CSS 变量统一转换为绝对路径。
• 修复开屏资源预加载时主菜单背景场景文件名路径错误导致 404 的问题。
• 修复多人读档大厅信息面板中生命、金币与层数图标展示，使用原版 ui_atlas 精灵规范渲染。
• 扩充音频同义词回退表（SYN），全面恢复原版暂停菜单开闭、地图开启/关闭/选点/擦除及反转商人等音效的精准播放。
• 修复营火休息（Rest/Heal）选项图标映射，确保各种选项 ID 下均 1:1 展示原版 option_heal 图标。
• 开屏启动动画 1:1 对齐原版 NLogoAnimation（还原落差时序、背景过渡与音效，移除多余非原版文字提示）。
• 全局及手柄虚拟光标接入原版石刻尖角指针与按压倾斜贴图。
• 补齐牌组浏览关闭音效与宝箱房间开启音效回退保障。
• 还原巨石翻滚（Rolling Boulder）逐个撞击目标受击伤害时序与震屏音效。

[gold][b]游戏机制[/b][/gold]
• 随机角色进阶难度对齐原版 StartRunLobby：修复选随机角色时无脑默认进阶 10 难度的错误，正常记忆并保存玩家设定的偏好进阶。

[gold][b]操作[/b][/gold]
• 对齐原版手柄选中视觉效果，采用原作金箔折角瞄准框与金色光晕高亮。`,
  },
  {
    date: '2026_10_11',
    eng: `[gold][b]Multiplayer[/b][/gold]
• Added Steam account sign-in support alongside guest play.
• Improved co-op reconnection handling, state synchronization, and room invitation links.
• Refined in-game co-op HUD, teammate previews, voting indicators, and daily challenge lobby.

[gold][b]Controls[/b][/gold]
• Enhanced gamepad navigation, snap targeting, card play flow, and input responsiveness across all screens.`,
    zhs: `[gold][b]多人联机[/b][/gold]
• 新增 Steam 账号登录支持，同时保留游客联机。
• 优化对局断线重连、房间邀请链接与多人数据同步稳定性。
• 完善联机局内队伍状态、队友意图预览、事件投票与每日挑战大厅展示。

[gold][b]操作[/b][/gold]
• 优化手柄按键吸附、指向性出牌与各界面的摇杆导航体验。`,
  },
  {
    date: '2026_10_10',
    eng: `[gold][b]Multiplayer[/b][/gold]
• Introduced web multiplayer co-op supporting up to 4 players across Standard, Daily, and Custom modes.
• Added room code invitations, lobby player management, shared ascension, and voting systems.

[gold][b]Controls[/b][/gold]
• Added comprehensive controller support with authentic button prompts and customizable keybindings.

[gold][b]Quality of Life[/b][/gold]
• Restored the original opening animation and audio, optimized loading performance, and added an in-game reload option.

[gold][b]Community[/b][/gold]
• Updated the QQ group QR code.`,
    zhs: `[gold][b]多人模式[/b][/gold]
• 新增网页版多人联机功能，支持最多 4 人游玩标准、每日与自定义模式。
• 支持房间代码与链接邀请、大厅玩家管理、共享进阶及局内投票等联机机制。

[gold][b]操作[/b][/gold]
• 完整接入手柄控制器支持，提供原作风格按键提示与自定义键位设置。

[gold][b]体验优化[/b][/gold]
• 还原开场动画与音效，优化资源加载与流畅度，并新增重载当前房间功能。

[gold][b]社区[/b][/gold]
• 更新 QQ 群二维码。`,
  },
  {
    date: '2026_10_09',
    eng: `[gold][b]Main menu[/b][/gold]
• Temporarily hidden the notice about the game being taken offline soon.

[gold][b]Game update[/b][/gold]
• Updated rules and game assets to public-beta v0.111.0.
• Added Traditional Chinese and Indonesian localization.

[gold][b]Combat & Display[/b][/gold]
• Prevented accidental browser text selection and ghost image dragging during gameplay.
• Fixed missing cursor images (404) when drawing or erasing on the map.
• Fixed a localization formatting error when hovering over the Act Boss icon.
• Fixed an issue where dragging the settings scrollbar downward would scroll upward.
• Fixed the settings language dropdown scrolling the entire settings panel together.
• Fixed black block artifacts on the corners of the settings toast notification.
• Fixed a white screen that could cover the game after continuing a saved run or changing screens.
• Fixed played or discarded cards remaining in the hand or on the table and blocking other cards.
• Fixed dragging cards from icons in their text being canceled.
• Fixed the Punch-Off event freezing the game at Instant speed.
• Fixed Defect beam effects and Architect damage text on the victory screen.
• Fixed a rendering error after Necrobinder's Doom kill animation.
• Fixed ending extra player turns and displaying their turn numbers.
• Fixed area potions being canceled instead of used from the potion belt.
• Fixed the final killing card lingering in the center of the screen upon combat victory.

[gold][b]Save compatibility[/b][/gold]
• Preserved existing v0.98.3 runs, including retired cards, when loading and re-saving with the public-beta rules.
• Existing Lasting Candy and Pumpkin Candle keep their original counters and effects.
• Preserved the original Doormaker battle and its changing forms in existing runs.`,
    zhs: `[gold][b]主菜单[/b][/gold]
• 暂时隐藏游戏近期下线提示。

[gold][b]游戏更新[/b][/gold]
• 游戏规则与资源更新至 public-beta v0.111.0。
• 新增繁体中文和印度尼西亚语。

[gold][b]战斗与画面[/b][/gold]
• 修复游戏内鼠标拖拽时可能误选中文本或拖出图片虚影的问题。
• 修复地图绘画和擦除时鼠标光标图片加载失败（404）的问题。
• 修复鼠标悬停在顶栏幕 Boss 图标上时的本地化文本格式化报错。
• 修复设置界面中向下拖拽滚动条反而向上滚动的问题。
• 修复设置中滚动语言下拉列表时带动整个面板一起滚动的问题。
• 修复设置提示气泡（Toast）边缘出现黑色色块的问题。
• 修复继续存档或切换界面后可能遮住游戏的白屏。
• 修复打出或弃掉的卡牌仍残留在手牌或桌面上、遮挡其他卡牌的问题。
• 修复从卡牌文字中的图标位置拖动时，出牌操作被取消的问题。
• 修复选择“瞬间”速度时，拳击比赛事件卡住游戏的问题。
• 修复故障机器人的光束特效及胜利结算的建筑师伤害文本。
• 修复死灵契约师的灾厄击杀动画结束后可能出现的渲染错误。
• 修复额外回合中结束回合可能失效及回合编号显示错误的问题。
• 修复从药水栏使用范围药水时，操作被取消的问题。
• 修复战斗胜利（打出最后一击斩杀）后打出的卡牌依然悬浮残留在屏幕正中央的问题。

[gold][b]存档兼容[/b][/gold]
• 升级 public-beta 规则后仍可继续、重新保存 v0.98.3 的旧对局，保留旧牌组中的已移除卡牌。
• 旧存档中的持久糖果和南瓜蜡烛保留原来的计数与效果。
• 保留旧对局中的门扉制造者战斗及其形态变化。`,
  },
  {
    date: '2026_10_08',
    eng: `[gold][b]Main menu[/b][/gold]
• Added a prominent notice that the game will be taken offline soon due to copyright issues, reminding players to manage their progress.
• Added a Wiki entry to the main menu, opening this site's Wiki in a new tab.`,
    zhs: `[gold][b]主菜单[/b][/gold]
• 新增醒目的下线提示：由于版权问题，游戏本体将会在近期下线，请注意管理自己的游戏进度。
• 主菜单新增 Wiki 入口，可在新标签页打开本站 Wiki。`,
  },
  {
    date: '2026_10_06',
    eng: `[gold][b]Performance[/b][/gold]
• Halved the memory music takes on phones and tablets, making crashes and blank screens less likely.

[gold][b]Community[/b][/gold]
• With both the browser and the game in Chinese, a QQ Group button in the main menu's bottom-left corner shows the group's QR code.

[gold][b]Wiki[/b][/gold]
• Added a wiki at /wiki/ on this site, in English and Chinese: cards, relics, potions, powers, keywords, characters, monsters, encounters and events, with the numbers shown in game, filters and search.`,
    zhs: `[gold][b]性能[/b][/gold]
• 手机和平板上音乐占用的内存减半，降低页面崩溃和白屏的概率。

[gold][b]社区[/b][/gold]
• 浏览器和游戏语言均为中文时，主菜单左下角新增「QQ群」按钮，点开可扫码加入玩家交流群。

[gold][b]资料站[/b][/gold]
• 本站新增 Wiki（/wiki/），提供中英文：卡牌、遗物、药水、能力、关键词、角色、怪物、遭遇战和事件，数值与游戏内一致，支持筛选和搜索。`,
  },
  {
    date: '2026_10_05',
    eng: `[gold][b]Save protection[/b][/gold]
• Failed writes now preserve the previous save; Save and Quit waits for pending saves.
• Prevented simultaneous game tabs from overwriting saves in browsers supporting Web Locks.
• Added downloadable backups for all profiles and run history, and backup restoration in General settings.
• Added a browser storage protection request in General settings.

[gold][b]Settings[/b][/gold]
• Added Unlock Everything to the General settings, on the main menu: it unlocks every character, all Timeline content and every Ascension level, and reveals Compendium entries on the current save profile. This cannot be undone.
• Clicking the notice in the main menu's bottom-right corner reopens the About This Project window.

[gold][b]Display fixes[/b][/gold]
• Fixed room backgrounds turning blank or black after visiting shops or rest sites on devices with limited graphics resources.`,
    zhs: `[gold][b]存档保护[/b][/gold]
• 修复写入失败可能丢失旧档的问题；保存并退出会等待存档完成。
• 支持 Web Locks 的浏览器会阻止多个游戏页面同时覆盖存档。
• 通用设置新增全存档及对局历史备份下载和备份恢复。
• 通用设置新增浏览器存储保护申请。

[gold][b]设置[/b][/gold]
• 主菜单的通用设置中新增「全解锁」：在当前存档中解锁全部角色、时间线中的全部内容和全部进阶等级，并点亮百科图鉴。此操作无法撤销。
• 点击主菜单右下角的说明文字可再次打开「关于本项目」窗口。

[gold][b]显示修复[/b][/gold]
• 修复图形资源受限的设备在进入商店、火堆后，房间背景持续空白或黑屏的问题。`,
  },
  {
    date: '2026_10_04',
    eng: `[gold][b]Display and layout[/b][/gold]
• Added an aspect ratio setting: Auto, 4:3, 16:10, 16:9 and 21:9.
• Menus, combat, maps and other screens now adapt to the selected aspect ratio, making better use of wide and tall displays.
• Removed the browser's blue touch highlight throughout the app.
• Fixed tiny End Turn text on iOS Safari and enlarged the button on small touch screens.

[gold][b]Touch controls[/b][/gold]
• Fixed buff descriptions disappearing while holding a status icon.
• Fixed buff icons not showing descriptions when held in Firefox for Android.
• Fixed card targeting arrows appearing away from your finger on iOS Safari, in both landscape and portrait.
• Cards now return to your hand when released there or without a valid target; interrupted touches also cancel the drag.

[gold][b]Audio[/b][/gold]
• Music and sound effects now fall back to MP3 on browsers without Ogg/Opus support, including older iOS Safari versions.
• Audio loading now retries brief network failures; failed samples can load again when played later without refreshing the page.

[gold][b]Feedback[/b][/gold]
• Added a feedback form, opened from the main menu or the settings. Feedback goes to the web port's author, not to Mega Crit.

[gold][b]Performance[/b][/gold]
• Reduced interface rendering memory use on small screens, fixing iPhone Safari reloading when starting a run.
• Reduced the particle count in the fight against The Insatiable for smoother play.`,
    zhs: `[gold][b]显示与布局[/b][/gold]
• 新增宽高比设置，支持自动、4:3、16:10、16:9 和 21:9。
• 主菜单、战斗、地图等界面随所选宽高比调整布局，更好地适配宽屏和较高的屏幕。
• 移除整个应用中按住按钮等控件时浏览器自带的蓝色触摸高亮。
• 修复 iOS Safari 上结束回合文字过小的问题，并放大小触屏上的按钮。

[gold][b]触屏操作[/b][/gold]
• 修复按住状态图标时，增益或减益效果说明消失的问题。
• 修复 Android 火狐浏览器中按住增益或减益图标无法显示说明的问题。
• 修复 iOS Safari 横屏和竖屏时，卡牌瞄准箭头偏离手指位置的问题。
• 卡牌在手牌区松开，或未选中有效目标时松开，会自动放回；触摸中断也会取消拖牌。

[gold][b]音频[/b][/gold]
• 不支持 Ogg/Opus 的浏览器会自动使用 MP3，修复旧版 iOS Safari 中音乐和部分音效无声的问题。
• 音频加载遇到短暂网络故障时会自动重试；加载失败的音频在后续播放时可重新加载，无需刷新页面。

[gold][b]问题反馈[/b][/gold]
• 新增问题反馈，可从主菜单或设置中打开。反馈会发给网页版作者，不会发给 Mega Crit。

[gold][b]性能[/b][/gold]
• 降低小屏幕上的界面绘制内存占用，修复 iPhone Safari 开局时反复重载的问题。
• 减少与「无厌沙虫」战斗时的粒子数量，让画面更流畅。`,
  },
  {
    date: '2026_10_03',
    eng: `[gold][b]Performance[/b][/gold]
• Mobile devices now start with more conservative rendering settings to reduce rendering load.
• Improved caching of game files and assets for repeat visits.

[gold][b]Fixes[/b][/gold]
• Fixed shop purchases with Lord's Parasol, including pause shortcuts while purchasing.
• Fixed combat controls in events that use the combat layout.
• Fixed the Crystal Sphere board disappearing behind its reward screen.
• Fixed the timing of the sculptor's particle effects.
• Centered reward icons and corrected the Proceed button's text styling.

[gold][b]Main menu[/b][/gold]
• Added a GitHub link and a notice identifying this project as an unofficial port.`,
    zhs: `[gold][b]性能[/b][/gold]
• 移动设备默认采用更保守的渲染设置，降低渲染负担。
• 优化游戏文件和资源的缓存，方便再次访问时复用已下载内容。

[gold][b]问题修复[/b][/gold]
• 修复持有「领主阳伞」时的商店购买流程，以及购买过程中的暂停快捷键。
• 修复使用战斗布局的事件中，战斗界面无法正常操作的问题。
• 修复「水晶球」事件打开奖励界面后，棋盘消失的问题。
• 修复雕刻师粒子特效的播放时机。
• 调整奖励图标的居中位置，并修复前进按钮的文字样式。

[gold][b]主菜单[/b][/gold]
• 新增 GitHub 入口和非官方移植说明。`,
  },
  {
    date: '2026_10_02',
    eng: `[gold][b]Controls and presentation[/b][/gold]
• Added the developer console. Press the backtick key to open or close it.
• Purchased cards now fly into the deck, and the deck counter updates after a purchase.
• Fixed the card removal selection screen in shops.
• Fixed potion popups closing as soon as they were pressed.
• Declared the game's dark color scheme to prevent browsers from darkening it again.
• Added an introduction to the web port and its GitHub project.`,
    zhs: `[gold][b]操作与表现[/b][/gold]
• 新增开发者控制台，可按反引号键打开或关闭。
• 购买的卡牌会飞入牌组，牌组数量也会随之更新。
• 修复商店移除卡牌时的选牌界面。
• 修复药水弹出菜单一按就关闭的问题。
• 声明游戏的深色配色，避免浏览器再次强制压暗画面。
• 新增网页移植版介绍及 GitHub 项目链接。`,
  },
  {
    date: '2026_10_01',
    eng: `[gold][b]The web port begins[/b][/gold]
• Released the first browser version of this unofficial port, based on Slay the Spire 2 v0.98.3.
• Added touch controls, including landscape presentation on portrait mobile screens and card dragging fixes.
• Restored full-resolution character and card artwork.
• The game initially selects a language based on your device settings; you can change it in Settings.
• Added support for installing the web app to your device's home screen.`,
    zhs: `[gold][b]网页移植版上线[/b][/gold]
• 发布首个浏览器版本，基于《杀戮尖塔 2》v0.98.3 制作的非官方移植。
• 适配触屏操作，包括手机竖屏时的横向显示，并修复卡牌拖拽问题。
• 恢复原始分辨率的角色与卡牌美术资源。
• 首次启动时根据设备设置选择游戏语言，也可在设置中手动切换。
• 支持将网页应用安装到设备主屏幕。`,
  },
];
