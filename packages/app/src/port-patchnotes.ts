/** Web port updates, newest first. Add both languages here; original game notes remain in assets/patch_notes. */
export const portPatchNotes: { date: string; eng: string; zhs: string }[] = [
  {
    date: '2026_10_11',
    eng: `[gold][b]Controls[/b][/gold]
• Fixed controller card play waiting for mouse dragging: cards now focus automatically, preview on Select, and play on a second press, with valid targets and aiming arrows snapping to enemies or allies.
• Map navigation now snaps between reachable nodes with the stick or directional buttons, and restores the current floor after scrolling.
• Fixed the first mouse click on a map node being ignored after controller navigation.`,
    zhs: `[gold][b]操作[/b][/gold]
• 修复手柄出牌仍需鼠标拖动的问题：自动聚焦手牌，按选择预览、再次选择出牌，有效目标与箭头吸附敌人或队友。
• 地图支持摇杆或方向键在可走节点间吸附切换，滚动后导航自动回到当前楼层。
• 修复手柄导航后切回鼠标时，第一次点击地图节点被忽略的问题。`,
  },
  {
    date: '2026_10_10',
    eng: `[gold][b]Multiplayer[/b][/gold]
• Added multiplayer co-op between web players, adhering to the original game's 4-player cap and mode structure.
• Supported hosting rooms for Standard, Daily, and Custom modes with up to 4 players.
• Rebuilt multiplayer screens and lobby using original game assets and layouts: SubmenuButton cards, nine-patch fuzzy dialogs, CharacterSelectScreen background and RemotePlayerContainer.
• Added room code invitations and one-click link sharing, with lobby hero selection and ready status.
• Implemented session persistence and seamless reconnects on page refresh, preventing slot shifts or phantom players.
• Restored authentic lobby character selection and ready flow: all players (including the host) can pick characters freely and toggle ready status. Switching hero resets ready status, and the run embarks when all players are ready.
• Added host kick player support with instant optimistic UI removal and resilient server broadcast.
• Fixed locked mode cards in the multiplayer host menu showing raw localization keys, now properly falling back to unlock requirement descriptions.
• Fixed co-op map votes failing to advance; player portraits now show each player's selected node.
• Shared map drawings now sync between players in their character colors; erasing and clearing affect only your own drawings.
• Fixed locked characters being usable in co-op and preserved each player's unlock progress when starting a run.
• Added shared ascension and seed settings, custom modifier selection, and original UTC daily character and modifier rolls.
• Team status now shows health, energy, hand size, turn readiness, and the screen each player is viewing.
• Treasure chests now show every shared relic, player votes, and a skip option, using the original allocation rules.
• Multiplayer runs run in isolated ephemeral sessions, keeping your singleplayer profile and saves completely intact.
 
[gold][b]Controls[/b][/gold]
• Restored the original mouse/keyboard, controller, and keyboard-only binding columns, with independent keyboard settings and keyboard navigation.
• Corrected controller defaults: A selects, Y confirms/ends turns, bumpers page, and triggers open piles; character selection now shows the matching button hints.
• Added full gamepad / controller support with console-style combat hand navigation, auto-targeting for single-target cards, and smooth virtual cursor for menus and maps.
• Unlocked and implemented the Input settings tab with customizable keyboard and controller keybindings and reset support.
• Controller bindings in Input settings now render original button icons from the controller atlas.
• Prevented the browser from capturing the Tab key for focus navigation, allowing Tab to be reliably bound and triggered in-game.
• Enabled opening the deck via hotkey from any room, not just in combat.
• Fixed deck and map shortcut hints to show the current keyboard bindings; rebinding the deck no longer keeps D as an extra shortcut.
• Shortcut hints now follow your custom bindings and switch between keyboard and controller buttons when you change input devices, including deck, map, piles, end turn, peek, confirm, and back.
• Controller hints use the original Xbox, PlayStation, or Switch button icons, matching the detected controller.
• Hand shortcut labels now show your assigned keys and hide unassigned controller buttons.
• Fixed old default shortcuts still triggering after rebinding, and controller pile shortcuts conflicting with hand navigation.
• Controller cursor hovering now shows button hints and reaches edge controls at different aspect ratios.
• Prevented controller cursor jumps after slow frames or returning to the browser tab.
 
[gold][b]Quality of Life[/b][/gold]
• Restored the original Mega Crit opening logo drop-in animation and iconic audio (supports click or keypress to skip).
• Pre-warmed WebGL shader cache and preloaded menu scenes concurrently in the background with high-performance GPU acceleration, eliminating first-trigger stutters.
• Integrated the original bottom-right LoadingOverlay ("Loading...") indicator when loading is still in progress, smoothly fading in to the main menu upon completion.
• Built in the "Quick SL Button" mod: reload the current room directly from the pause menu, with an option in Settings to toggle it.
• Added limited retries for temporary game file loading failures, with a reload button when loading fails or takes too long.
• Adjusted pause menu title line height and spacing to prevent overlapping with buttons.
• Fixed a black screen issue when traveling to the next room on the map.
 
[gold][b]Community[/b][/gold]
• Updated the QQ group QR code.`,
    zhs: `[gold][b]多人模式[/b][/gold]
• 实现网页版玩家之间多人联机合作功能，遵循原版最高 4 人联机与模式设定。
• 完整提供原版“标准模式”、“多人每日挑战”与“自定模式”多人建房选项。
• 全面以原作素材与布局重构多人模式界面：复用原版大卡片子菜单、九宫格弹窗、角色选择场景与左上角远程玩家状态面板（RemotePlayerContainer）。
• 支持房间号邀请与一键复制邀请链接，进入大厅可自由选择角色并准备就绪。
• 增加大厅会话恢复（Session Persistence）与断线重连机制，解决移动端与浏览器刷新页面时槽位递增或判定为新玩家的问题。
• 还原原作大厅选人与就绪流程：所有玩家（包含房主）均可在选好角色后自主点击准备/取消就绪，切换角色自动重置准备状态，全员就绪后由房主启程。
• 房主可在大厅中踢出客机玩家：支持乐观即时响应与安全广播，房主界面卡片立刻移除，被踢玩家准确显示通知。
• 修复多人建房菜单中未解锁模式大卡片底部显示原始本地化键名的问题，正确展示解锁条件说明。
• 修复多人地图投票后无法前进的问题，节点旁现在显示各玩家选择的角色头像。
• 地图绘画按角色颜色同步给其他玩家，擦除和清空只影响自己的绘画。
• 修复多人模式可使用锁定角色的问题，开局正确继承各玩家的解锁进度。
• 补齐共享进阶难度、种子与自定义词缀设置，每日挑战按原版规则生成角色和词缀。
• 新增队友生命、能量、手牌数量、回合准备与所在界面的状态显示。
• 宝箱展示全部共享遗物、玩家选择与放弃选项，按原版规则分配遗物。
• 多人对局采用独立临时会话存储，不破坏或覆盖单人本地存档。

[gold][b]操作[/b][/gold]
• 操作设置还原鼠标+键盘、控制器、纯键盘三列，支持独立键位保存与纯键盘导航。
• 手柄默认操作遵循原版：A 选择、Y 确认/结束回合，肩键翻页、扳机查看牌堆；角色选择页显示对应按键提示。
• 新增完整手柄（控制器）支持：战斗中采用主机版手牌轮盘与指向性卡牌敌人自动吸附切换；菜单、地图与商店支持摇杆虚拟光标与右摇杆滚屏。
• 解锁并完整实现设置中的“操作设置”：支持自定义键盘按键与手柄按钮绑定，并可一键重置为默认。
• 操作设置中的手柄按键列现在渲染原作图集专用按键图标。
• 阻止浏览器默认焦点切换对 Tab 键的截获，确保将查看卡牌组等快捷键绑定至 Tab 时可在游戏内稳定触发。
• 允许在任意房间（包括地图、事件、商店等）通过快捷键直接打开卡牌组，不再局限于战斗中。
• 修复查看牌组和地图的按键提示未跟随当前键位的问题；修改牌组快捷键后，D 不再额外触发。
• 快捷键提示跟随自定义绑定，并按最近使用的键鼠或手柄自动切换：包括牌组、地图、牌堆、结束回合、查看战场、确认和返回。
• 手柄按键提示使用原作专用图标，并根据识别到的 Xbox、PlayStation 或 Switch 手柄切换。
• 手牌快捷键标签显示当前绑定，手柄模式下隐藏未绑定按钮的标签。
• 修复修改键位后旧默认键仍然触发，以及手柄牌堆快捷键与手牌切换冲突的问题。
• 手柄虚拟光标悬停可显示按钮提示，并可在不同宽高比下到达屏幕边缘的控件。
• 修复低帧率或返回浏览器标签页后手柄光标跳跃过大的问题。

[gold][b]便利功能[/b][/gold]
• 还原 Mega Crit 原版开屏 Logo 弹入动画与标志性开场音效（支持随时点击或按键跳过）。
• 在开场动画期间后台静默完成高性能 GPU 硬件加速初始化、着色器缓存预热（Shader Cache）与主菜单场景预载，杜绝游戏首次战斗与特效掉帧。
• 若跳过动画或加载尚未完成，在右下角优雅展示原版样式的“正在加载...”提示（NLoadingOverlay），完成后无缝黑屏淡入主菜单。
• 内置“快速SL按钮”模组：暂停菜单中可直接原地重新加载当前房间，并可在通用设置中随时开启或关闭。
• 游戏文件临时加载失败时会有限次数地自动重试；加载失败或等待过久时可直接重新加载。
• 优化暂停菜单布局与标题行高，修复“已暂停”标题与继续按钮过于靠近重叠的问题。
• 修复在地图上选择节点进入下一关/房间时黑屏的问题。

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
