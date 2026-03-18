// js/database.js
const portfolioData = {
    // 你的作品集项目列表
    projects: [
        {
            title: "Monsterpedia",
            tags: ["Team Project", "Narrative Investigation", "Social Combat"], // 标签我帮你换成了更贴合项目设定的词
            desc: "主打“社交破防”机制的像素风超自然侦探游戏 。告别传统战斗，通过现场勘查与线索交叉比对，在心理博弈中用铁证撕开伪装，找出看似普通犯罪背后的真凶 。",
            link: "monsterpedia.html" 
        },
        {
            title: "Graves of Sailors",
            tags: ["Tabletop Game", "System Design", "Balancing"],
            desc: "二战背景下的“迷雾”海战桌游，在物理桌面还原电子游戏级的行为侧写与视野博弈。",
            link: "sailors.html" // 必须和你刚建的文件名完全一致
        },
        {
            title: "Dualing Drivers",
            tags: ["Prototype", "Controller Input", "Level Editor"],
            desc: "硬核 2D 像素双人坦克对抗。独立实现拟真履带（双摇杆驱动）与街机双轨驾驶模型，并开发了支持文件读写的自定义关卡编辑器。",
            link: "tank-battle.html" 
        },
        {
            title: "CK3系统拆解",
            tags: ["System Teardown", "Reverse Engineering", "Core Loop"],
            desc: "对P社大战略游戏《十字军之王3》的底层架构进行逆向工程。全面解构法理、经济、密谋与压力系统，探寻 SLG 与 RPG 结合的动态生态平衡机制。",
            link: "ck3-teardown.html" 
        }
    ]
};