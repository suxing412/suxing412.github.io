const translations = {
    en: {
        pageTitle: "Xing Su's Game Design Portfolio",
        navBio: "About Me",
        navSkills: "Skills & Tools",
        navProjects: "Projects",
        navGithub: "GitHub Repo",
        navContact: "Contact",
        bioTitle: "About Me",
        bioContent: "Hello! My name is Xing Su, and I am a passionate game designer with a background in game design and development. I am currently a student at the Rochester Institute of Technology, majoring in Game Design and Development. I am originally from China and have always been fascinated by the intersection of technology and creativity. My goal is to create immersive and engaging gaming experiences that captivate players and tell compelling stories. I am currently seeking opportunities to work with innovative game studios where I can contribute my skills and grow as a professional game designer.",
        skillsTitle: "Skills & Tools",
        skill1: "C#, MonoGame, Unity",
        skill2: "Level Design, Narrative Design, Gameplay Balancing",
        skill3: "Git, Visual Studio, Photoshop",
        projectsTitle: "Projects",
        project1: "Dualing Drivers",
        project2: "There Are No Flowers On The Graves Of Sailors—Design Document: ",
        project3: "Project 3: ",
        githubTitle: "My GitHub Repo",
        githubLink: "GitHub Repository",
        contactTitle: "Contact",
        contactContent: "Feel free to reach out to me via email at <a href='mailto:xsu217822@gmail.com' id='email-link'>xsu@example.com</a> or connect with me on <a href='https://www.linkedin.com/in/xsu217822' target='_blank' id='linkedin-link'>LinkedIn</a>.",
        footerConnect: "Connect with me on",
        linkedin: "LinkedIn",
        twitter: "Twitter",
        facebook: "Facebook",
        footerCopyright: "&copy; 2024 Xing Su. All rights reserved."
    },
    zh: {
        pageTitle: "苏省的游戏设计作品集",
        navBio: "关于我",
        navSkills: "技能与工具",
        navProjects: "项目",
        navGithub: "GitHub 仓库",
        navContact: "联系",
        bioTitle: "关于我",
        bioContent: "你好！我叫苏省，我目前是罗彻斯特理工学院的学生，主修游戏设计与开发。我一直对技术与创意的交汇感到着迷。我的目标是创造沉浸式和引人入胜的游戏体验，吸引玩家并讲述引人入胜的故事。我目前正在寻找与创新游戏工作室合作的机会，在那里我可以贡献我的技能并成长为一名专业的游戏设计师。",
        skillsTitle: "技能与工具",
        skill1: "C#, MonoGame, Unity",
        skill2: "关卡设计, 叙事设计, 游戏平衡",
        skill3: "Git, Visual Studio, Photoshop",
        projectsTitle: "项目",
        project1: "Dualing Drivers",
        project2: "水兵的坟墓不会开出鲜花--游戏策划案: ",
        project3: "项目 3: ",
        githubTitle: "我的 GitHub 仓库",
        githubLink: "GitHub 仓库",
        contactTitle: "联系",
        contactContent: "欢迎通过电子邮件 <a href='mailto:xsu217822@gmail.com' id='email-link'>xsu@example.com</a> 或在 <a href='https://www.linkedin.com/in/xsu217822' target='_blank' id='linkedin-link'>LinkedIn</a> 上与我联系。",
        footerConnect: "通过以下方式联系我",
        linkedin: "领英",
        twitter: "推特",
        facebook: "脸书",
        footerCopyright: "&copy; 2024 苏省。版权所有。"
    }
};

document.getElementById('language-selector').addEventListener('change', function(event) {
    const language = event.target.value;
    document.getElementById('page-title').textContent = translations[language].pageTitle;
    document.getElementById('nav-bio').textContent = translations[language].navBio;
    document.getElementById('nav-skills').textContent = translations[language].navSkills;
    document.getElementById('nav-projects').textContent = translations[language].navProjects;
    document.getElementById('nav-github').textContent = translations[language].navGithub;
    document.getElementById('nav-contact').textContent = translations[language].navContact;
    document.getElementById('bio-title').textContent = translations[language].bioTitle;
    document.getElementById('bio-content').textContent = translations[language].bioContent;
    document.getElementById('skills-title').textContent = translations[language].skillsTitle;
    document.getElementById('skill-1').textContent = translations[language].skill1;
    document.getElementById('skill-2').textContent = translations[language].skill2;
    document.getElementById('skill-3').textContent = translations[language].skill3;
    document.getElementById('projects-title').textContent = translations[language].projectsTitle;
    document.getElementById('project-1').textContent = translations[language].project1;
    document.getElementById('project-2').textContent = translations[language].project2;
    document.getElementById('project-3').textContent = translations[language].project3;
    document.getElementById('github-title').textContent = translations[language].githubTitle;
    document.getElementById('github-link').textContent = translations[language].githubLink;
    document.getElementById('contact-title').textContent = translations[language].contactTitle;
    document.getElementById('contact-content').innerHTML = translations[language].contactContent;
    document.getElementById('footer-connect').textContent = translations[language].footerConnect;
    document.getElementById('linkedin').textContent = translations[language].linkedin;
    document.getElementById('twitter').textContent = translations[language].twitter;
    document.getElementById('facebook').textContent = translations[language].facebook;
    document.getElementById('footer-copyright').innerHTML = translations[language].footerCopyright;
});

// 初始化页面内容为默认语言
document.getElementById('language-selector').dispatchEvent(new Event('change'));