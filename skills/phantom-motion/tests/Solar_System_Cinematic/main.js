import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const P = "./assets/";

// === 行星配置(含卫星) ===
const PLANETS = [
	{
		id: "sun",
		tex: "8k_sun.jpg",
		r: 55,
		dist: 0,
		speed: 0,
		rot: 0.0008,
		tilt: 0,
		emI: 0,
		type: "sun",
		atmos: null,
		moons: [],
	},
	{
		id: "mercury",
		tex: "mercury.jpg",
		r: 3.5,
		dist: 110,
		speed: 0.0009,
		rot: 0.002,
		tilt: 0.03,
		emI: 0.18,
		type: "std",
		atmos: null,
		moons: [],
	},
	{
		id: "venus",
		tex: "venus.jpg",
		r: 10,
		dist: 170,
		speed: 0.0006,
		rot: -0.001,
		tilt: 2.64,
		emI: 0.15,
		type: "std",
		atmos: "0.9,0.55,0.15",
		moons: [],
	},
	{
		id: "earth",
		tex: "8k_earth.jpg",
		r: 11,
		dist: 240,
		speed: 0.0004,
		rot: 0.003,
		tilt: 0.41,
		emI: 0.1,
		type: "std",
		atmos: "0.3,0.6,1.0",
		moons: [{ name: "月球", r: 2.8, dist: 25, speed: 0.5, tex: "moon.jpg" }],
	},
	{
		id: "mars",
		tex: "mars.jpg",
		r: 5.5,
		dist: 340,
		speed: 0.0003,
		rot: 0.003,
		tilt: 0.44,
		emI: 0.14,
		type: "std",
		atmos: "0.7,0.25,0.1",
		moons: [
			{ name: "火卫一", r: 0.8, dist: 12, speed: 0.8, style: "rocky" },
			{ name: "火卫二", r: 0.5, dist: 18, speed: 0.4, style: "rocky" },
		],
	},
	{
		id: "jupiter",
		tex: "jupiter.jpg",
		r: 50,
		dist: 520,
		speed: 0.00015,
		rot: 0.005,
		tilt: 0.05,
		emI: 0.1,
		type: "std",
		atmos: null,
		moons: [
			{ name: "木卫一", r: 2.2, dist: 65, speed: 0.6, style: "io" },
			{ name: "木卫二", r: 2, dist: 72, speed: 0.45, style: "europa" },
			{ name: "木卫三", r: 3, dist: 82, speed: 0.35, style: "ganymede" },
			{ name: "木卫四", r: 2.5, dist: 95, speed: 0.25, style: "callisto" },
		],
	},
	{
		id: "saturn",
		tex: "saturn.jpg",
		r: 42,
		dist: 750,
		speed: 0.0001,
		rot: 0.004,
		tilt: 0.47,
		emI: 0.12,
		type: "std",
		atmos: null,
		ring: true,
		moons: [
			{ name: "土卫六", r: 3, dist: 75, speed: 0.3, style: "titan" },
			{ name: "土卫五", r: 1.2, dist: 60, speed: 0.5, style: "icy" },
			{ name: "土卫四", r: 1, dist: 55, speed: 0.6, style: "icy" },
		],
	},
	{
		id: "uranus",
		tex: "uranus.jpg",
		r: 18,
		dist: 1000,
		speed: 0.00006,
		rot: 0.003,
		tilt: 1.71,
		emI: 0.18,
		type: "std",
		atmos: "0.4,0.8,0.9",
		moons: [
			{ name: "天卫三", r: 1.5, dist: 30, speed: 0.5, style: "darkice" },
			{ name: "天卫四", r: 1.8, dist: 38, speed: 0.35, style: "darkice" },
			{ name: "天卫一", r: 0.8, dist: 24, speed: 0.7, style: "darkice" },
		],
	},
	{
		id: "neptune",
		tex: "neptune.jpg",
		r: 17,
		dist: 1250,
		speed: 0.00004,
		rot: 0.002,
		tilt: 0.49,
		emI: 0.2,
		type: "std",
		atmos: "0.15,0.25,0.85",
		moons: [{ name: "海卫一", r: 2, dist: 30, speed: 0.4, style: "triton" }],
	},
];

// === 页面数据(含卫星信息) ===
const D = [
	{ id: "overview", type: "hero" },
	{
		id: "sun",
		type: "card",
		k: "00 // THE STAR",
		t: "太阳 SUN",
		d: "星系核聚变主宰。内核 1500 万度，每秒将 6 亿吨氢聚变为氦。FBM 着色器模拟日冕喷发与太阳黑子活动。",
		data: ["质量 1.989×10³⁰ kg", "直径 1,392,700 km", "表温 5,778 K"],
	},
	{
		id: "mercury",
		type: "card",
		k: "01 // MESSENGER",
		t: "水星 MERCURY",
		d: "距太阳最近的岩石行星，无卫星。昼夜温差 600°C，表面遍布陨石坑，轨道离心率为太阳系之最。",
		data: ["直径 4,879 km", "公转 87.97 天", "卫星 0"],
	},
	{
		id: "venus",
		type: "card",
		k: "02 // EVENING STAR",
		t: "金星 VENUS",
		d: "浓密 CO₂ 大气制造失控温室效应，表面 465°C。无卫星，逆向自转使一天比一年还长。",
		data: ["直径 12,104 km", "公转 224.7 天", "卫星 0"],
	},
	{
		id: "earth",
		type: "card",
		k: "03 // PALE BLUE DOT",
		t: "地球与月球",
		d: "已知唯一生命摇篮。瑞利散射赋予蓝色大气。月球直径 3,474 km，与地球潮汐锁定，调控潮汐与地轴稳定。",
		data: ["直径 12,756 km", "卫星 1 颗", "海洋 71%"],
	},
	{
		id: "mars",
		type: "card",
		k: "04 // RED PLANET",
		t: "火星 MARS",
		d: "氧化铁覆盖的红色沙漠。奥林帕斯山 21.9 km。拥有火卫一(Phobos)和火卫二(Deimos)两颗不规则小卫星。",
		data: ["直径 6,792 km", "卫星 2 颗", "重力 0.38g"],
	},
	{
		id: "jupiter",
		type: "card",
		k: "05 // GAS GIANT",
		t: "木星 JUPITER",
		d: "质量为其余七颗总和 2.5 倍。大红斑风暴 350+ 年。四颗伽利略卫星：木卫一(Io)、木卫二(Europa)、木卫三(Ganymede)、木卫四(Callisto)。",
		data: ["直径 142,984 km", "卫星 95+", "自转 9.93 h"],
	},
	{
		id: "saturn",
		type: "card",
		k: "06 // LORD OF RINGS",
		t: "土星 SATURN",
		d: "环系跨度 28 万 km 厚仅 10 m。密度比水低。土卫六(Titan)是太阳系第二大卫星，拥有浓密大气层和液态甲烷湖泊。",
		data: ["直径 120,536 km", "卫星 146+", "密度 0.687"],
	},
	{
		id: "uranus",
		type: "card",
		k: "07 // ICE GIANT",
		t: "天王星 URANUS",
		d: '自转轴倾斜 97.77°"躺着"公转。甲烷大气赋予蓝绿色调。27 颗已知卫星以莎士比亚角色命名。',
		data: ["直径 51,118 km", "卫星 27", "倾角 97.77°"],
	},
	{
		id: "neptune",
		type: "card",
		k: "08 // DEEP BLUE",
		t: "海王星 NEPTUNE",
		d: "风速 2,100 km/h 超音速飓风。海卫一(Triton)逆行公转，表面温度 -235°C，是太阳系最冷天体之一。",
		data: ["直径 49,528 km", "卫星 16", "风速 2,100 km/h"],
	},
	{
		id: "halley",
		type: "card",
		k: "09 // COMET",
		t: "哈雷彗星 HALLEY",
		d: "周期约 75-79 年的著名周期彗星，上次回归 1986 年，预计 2061 年再次造访。彗尾在接近太阳时受太阳风吹拂可延伸数千万公里。",
		data: ["周期 75.3 年", "下次 2061 年", "尾长 1 亿 km"],
	},
	{ id: "outro", type: "hero" },
];

let idx = 0,
	moving = false,
	scene,
	camera,
	renderer,
	composer,
	controls;
const B = {};
const allMoonMeshes = [];

const mgr = new THREE.LoadingManager();
mgr.onProgress = (_, l, t) => {
	document.getElementById("prog").style.width = (l / t) * 100 + "%";
};
mgr.onLoad = () => {
	gsap.to("#loader", {
		opacity: 0,
		duration: 1.2,
		onComplete: () => {
			document.getElementById("loader").style.display = "none";
			uiUpdate(0);
			focusCam(0);
			playHeroAnim();
		},
	});
};
const TL = new THREE.TextureLoader(mgr);

// === SVG 巨幕动画 ===
function playHeroAnim() {
	const tl = gsap.timeline();
	tl.to("#svg-stroke", {
		strokeDashoffset: 0,
		duration: 2.5,
		ease: "power2.inOut",
	})
		.to("#svg-fill", { opacity: 1, duration: 1.2, ease: "power2.out" }, "-=1")
		.to("#svg-glow", { opacity: 1, duration: 1, ease: "power2.out" }, "-=0.8")
		.to(
			"#svg-sub",
			{ strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" },
			"-=1.5",
		)
		.fromTo(
			"#hero-kicker",
			{ opacity: 0, y: 20 },
			{ opacity: 1, y: 0, duration: 0.8 },
			"-=1.2",
		)
		.fromTo(
			"#hero-sub",
			{ opacity: 0, y: 15 },
			{ opacity: 1, y: 0, duration: 0.8 },
			"-=0.6",
		)
		.fromTo(
			"#hero-label",
			{ opacity: 0 },
			{ opacity: 0.5, duration: 0.8 },
			"-=0.3",
		);
}

// === 程序化卫星纹理生成器 ===
function makeTex(w, h, fn) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	fn(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	t.needsUpdate = true;
	return t;
}
const MOON_TEX = {
	luna: (x, w, h) => {
		// 月球：灰色+大量陨石坑
		x.fillStyle = "#aaa";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 300; i++) {
			const r = Math.random() * 8 + 1;
			x.beginPath();
			x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
			x.fillStyle = `rgba(${80 + Math.random() * 40},${80 + Math.random() * 40},${85 + Math.random() * 35},${0.3 + Math.random() * 0.3})`;
			x.fill();
		}
		for (let i = 0; i < 15; i++) {
			const r = Math.random() * 14 + 6;
			x.beginPath();
			x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
			x.strokeStyle = "rgba(60,60,60,0.3)";
			x.lineWidth = 2;
			x.stroke();
		}
	},
	io: (x, w, h) => {
		// 木卫一Io：黄色火山表面
		x.fillStyle = "#d4b030";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 100; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 6 + 2,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${180 + Math.random() * 70},${80 + Math.random() * 60},${10 + Math.random() * 20},0.6)`;
			x.fill();
		}
		for (let i = 0; i < 20; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 3 + 1,
				0,
				Math.PI * 2,
			);
			x.fillStyle = "rgba(30,30,10,0.7)";
			x.fill();
		}
	},
	europa: (x, w, h) => {
		// 木卫二Europa：白色冰面+裂纹
		x.fillStyle = "#dde8f0";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 40; i++) {
			x.beginPath();
			x.moveTo(Math.random() * w, Math.random() * h);
			for (let j = 0; j < 5; j++)
				x.lineTo(Math.random() * w, Math.random() * h);
			x.strokeStyle = `rgba(${100 + Math.random() * 50},${60 + Math.random() * 40},${40 + Math.random() * 20},0.25)`;
			x.lineWidth = 0.5 + Math.random();
			x.stroke();
		}
	},
	ganymede: (x, w, h) => {
		// 木卫三：灰褐混合
		x.fillStyle = "#8a8070";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 200; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 5 + 1,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${100 + Math.random() * 60},${90 + Math.random() * 50},${80 + Math.random() * 40},0.4)`;
			x.fill();
		}
	},
	callisto: (x, w, h) => {
		// 木卫四：深色密集陨石坑
		x.fillStyle = "#555050";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 400; i++) {
			const r = Math.random() * 4 + 1;
			x.beginPath();
			x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
			x.fillStyle = `rgba(${40 + Math.random() * 30},${38 + Math.random() * 30},${35 + Math.random() * 30},0.5)`;
			x.fill();
		}
	},
	titan: (x, w, h) => {
		// 土卫六：橙色雾霾大气
		const g = x.createLinearGradient(0, 0, 0, h);
		g.addColorStop(0, "#c8820a");
		g.addColorStop(0.5, "#b07020");
		g.addColorStop(1, "#906018");
		x.fillStyle = g;
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 150; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 8 + 2,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${160 + Math.random() * 60},${100 + Math.random() * 40},${20 + Math.random() * 20},0.15)`;
			x.fill();
		}
	},
	icy: (x, w, h) => {
		// 土卫/天卫冰卫星
		x.fillStyle = "#c8ccd0";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 120; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 5 + 1,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${160 + Math.random() * 60},${170 + Math.random() * 50},${180 + Math.random() * 40},0.3)`;
			x.fill();
		}
	},
	darkice: (x, w, h) => {
		// 天王星暗冰卫星
		x.fillStyle = "#606870";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 100; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 4 + 1,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${50 + Math.random() * 30},${55 + Math.random() * 30},${60 + Math.random() * 30},0.4)`;
			x.fill();
		}
	},
	triton: (x, w, h) => {
		// 海卫一：粉色冰面
		x.fillStyle = "#c8a8b0";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 80; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 6 + 2,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${180 + Math.random() * 40},${140 + Math.random() * 40},${150 + Math.random() * 40},0.3)`;
			x.fill();
		}
		for (let i = 0; i < 15; i++) {
			x.beginPath();
			x.moveTo(Math.random() * w, Math.random() * h);
			x.lineTo(Math.random() * w, Math.random() * h);
			x.strokeStyle = "rgba(90,70,80,0.2)";
			x.lineWidth = 1;
			x.stroke();
		}
	},
	rocky: (x, w, h) => {
		// 不规则岩石卫星
		x.fillStyle = "#706860";
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 100; i++) {
			x.beginPath();
			x.arc(
				Math.random() * w,
				Math.random() * h,
				Math.random() * 3 + 1,
				0,
				Math.PI * 2,
			);
			x.fillStyle = `rgba(${50 + Math.random() * 40},${45 + Math.random() * 35},${40 + Math.random() * 30},0.5)`;
			x.fill();
		}
	},
};
function getMoonTex(style) {
	return makeTex(512, 256, MOON_TEX[style] || MOON_TEX.rocky);
}

// Atmosphere shader
const AV = `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
function AF(c) {
	return `varying vec3 vN;void main(){float i=pow(0.55-dot(vN,vec3(0,0,1)),3.0);gl_FragColor=vec4(${c},1.0)*i;}`;
}
function mkAtm(r, c) {
	return new THREE.Mesh(
		new THREE.SphereGeometry(r * 1.18, 64, 64),
		new THREE.ShaderMaterial({
			vertexShader: AV,
			fragmentShader: AF(c),
			side: THREE.BackSide,
			transparent: true,
			blending: THREE.AdditiveBlending,
		}),
	);
}

// === SUN FBM SHADER (炙热效果) ===
const sunVert = `varying vec2 vUv;varying vec3 vPos;void main(){vUv=uv;vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const sunFrag = `
uniform float uTime;uniform sampler2D uTex;varying vec2 vUv;varying vec3 vPos;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
void main(){
  vec2 uv=vUv;
  float n=fbm(uv*6.0+uTime*0.15);
  float n2=fbm(uv*12.0-uTime*0.1);
  vec4 base=texture2D(uTex,uv);
  vec3 hot=mix(vec3(1.0,0.3,0.0),vec3(1.0,0.9,0.3),n);
  vec3 col=mix(base.rgb,hot,0.4+n2*0.3);
  col+=vec3(0.15,0.05,0.0)*fbm(uv*20.0+uTime*0.2);
  gl_FragColor=vec4(col*1.3,1.0);
}`;

// Saturn ring radial UV
function mkRing(inner, outer) {
	const g = new THREE.RingGeometry(inner, outer, 128);
	const p = g.attributes.position,
		u = g.attributes.uv,
		v = new THREE.Vector3();
	for (let i = 0; i < p.count; i++) {
		v.fromBufferAttribute(p, i);
		u.setXY(i, (v.length() - inner) / (outer - inner), 1);
	}
	return new THREE.Mesh(
		g,
		new THREE.MeshStandardMaterial({
			map: TL.load(P + "saturn_ring.png"),
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.6,
			emissive: 0x332200,
			emissiveIntensity: 0.15,
		}),
	);
}

// === HALLEY COMET ===
let cometGroup, cometTail;
function mkComet() {
	cometGroup = new THREE.Group();
	// 彗核
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(2, 16, 16),
		new THREE.MeshStandardMaterial({
			color: 0x888877,
			emissive: 0x444433,
			emissiveIntensity: 0.5,
			roughness: 0.8,
		}),
	);
	cometGroup.add(core);
	// 彗发(coma)
	const coma = new THREE.Mesh(
		new THREE.SphereGeometry(5, 16, 16),
		new THREE.MeshBasicMaterial({
			color: 0xaaddff,
			transparent: true,
			opacity: 0.15,
			blending: THREE.AdditiveBlending,
		}),
	);
	cometGroup.add(coma);
	// 彗尾(粒子)
	const tN = 3000,
		tG = new THREE.BufferGeometry();
	const tp = new Float32Array(tN * 3),
		tc = new Float32Array(tN * 3);
	for (let i = 0; i < tN; i++) {
		const d = Math.random() * 120;
		tp[i * 3] = d + Math.random() * 8;
		tp[i * 3 + 1] = (Math.random() - 0.5) * 6;
		tp[i * 3 + 2] = (Math.random() - 0.5) * 6;
		const a = 1 - d / 120;
		tc[i * 3] = 0.6 + a * 0.4;
		tc[i * 3 + 1] = 0.7 + a * 0.3;
		tc[i * 3 + 2] = 0.9 + a * 0.1;
	}
	tG.setAttribute("position", new THREE.BufferAttribute(tp, 3));
	tG.setAttribute("color", new THREE.BufferAttribute(tc, 3));
	cometTail = new THREE.Points(
		tG,
		new THREE.PointsMaterial({
			size: 1.2,
			vertexColors: true,
			transparent: true,
			opacity: 0.5,
			blending: THREE.AdditiveBlending,
		}),
	);
	cometGroup.add(cometTail);
	cometGroup.position.set(1500, 100, -200);
	scene.add(cometGroup);
	B.halley = {
		orbGroup: cometGroup,
		planetGroup: cometGroup,
		mesh: core,
		r: 5,
		dist: 1500,
	};
}

function init() {
	const cv = document.getElementById("bg");
	renderer = new THREE.WebGLRenderer({
		canvas: cv,
		antialias: true,
		alpha: true,
		powerPreference: "high-performance",
	});
	renderer.setSize(innerWidth, innerHeight);
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.4;

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 80000);
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.06;

	composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(
		new UnrealBloomPass(
			new THREE.Vector2(innerWidth, innerHeight),
			0.8,
			0.3,
			0.8,
		),
	);
	composer.addPass(new OutputPass());

	// LIGHTING
	scene.add(new THREE.AmbientLight(0xffffff, 0.35));
	const sl = new THREE.PointLight(0xfff4d0, 6.0, 0, 1.0);
	scene.add(sl);
	scene.add(new THREE.DirectionalLight(0x4466aa, 0.3).translateZ(1000));

	const sunTime = { value: 0 };

	// BUILD PLANETS
	PLANETS.forEach((p) => {
		const orbG = new THREE.Group(),
			plG = new THREE.Group();
		plG.position.x = p.dist;
		if (p.tilt) plG.rotation.z = p.tilt;

		let mesh;
		const tex = TL.load(P + p.tex);
		if (p.type === "sun") {
			mesh = new THREE.Mesh(
				new THREE.SphereGeometry(p.r, 128, 128),
				new THREE.ShaderMaterial({
					uniforms: { uTime: sunTime, uTex: { value: tex } },
					vertexShader: sunVert,
					fragmentShader: sunFrag,
				}),
			);
			// 日冕外发光
			const corona = new THREE.Mesh(
				new THREE.SphereGeometry(p.r * 1.25, 64, 64),
				new THREE.ShaderMaterial({
					vertexShader: AV,
					fragmentShader: `varying vec3 vN;void main(){float i=pow(0.7-dot(vN,vec3(0,0,1)),2.5);gl_FragColor=vec4(1.0,0.6,0.1,1.0)*i;}`,
					side: THREE.BackSide,
					transparent: true,
					blending: THREE.AdditiveBlending,
				}),
			);
			plG.add(corona);
		} else {
			mesh = new THREE.Mesh(
				new THREE.SphereGeometry(p.r, 64, 64),
				new THREE.MeshStandardMaterial({
					map: tex,
					roughness: 0.7,
					metalness: 0.05,
					emissive: new THREE.Color().setHSL(0.1, 0.3, 0.15),
					emissiveIntensity: p.emI,
				}),
			);
		}
		plG.add(mesh);
		if (p.atmos) plG.add(mkAtm(p.r, p.atmos));
		if (p.ring) {
			const rr = mkRing(p.r * 1.4, p.r * 2.4);
			rr.rotation.x = Math.PI / 2 + 0.2;
			plG.add(rr);
		}

		// MOONS - 月球用真实贴图，其余卫星用程序化纹理
		p.moons.forEach((m) => {
			const mMap = m.tex ? TL.load(P + m.tex) : getMoonTex(m.style);
			const mMesh = new THREE.Mesh(
				new THREE.SphereGeometry(m.r, 24, 24),
				new THREE.MeshStandardMaterial({
					map: mMap,
					roughness: 0.85,
					emissive: 0x333333,
					emissiveIntensity: 0.3,
				}),
			);
			mMesh.position.x = m.dist;
			mMesh.userData = { orbitDist: m.dist, orbitSpeed: m.speed, parent: plG };
			plG.add(mMesh);
			allMoonMeshes.push(mMesh);
		});

		orbG.add(plG);
		scene.add(orbG);
		if (p.dist > 0) {
			const og = new THREE.RingGeometry(p.dist - 0.3, p.dist + 0.3, 256);
			scene.add(
				new THREE.Mesh(
					og,
					new THREE.MeshBasicMaterial({
						color: 0xffffff,
						transparent: true,
						opacity: 0.05,
						side: THREE.DoubleSide,
					}),
				).rotateX(Math.PI / 2),
			);
		}
		B[p.id] = {
			orbGroup: orbG,
			planetGroup: plG,
			mesh,
			r: p.r,
			dist: p.dist,
			speed: p.speed,
			rot: p.rot,
		};
	});

	// Halley comet
	mkComet();

	// Starfield
	scene.add(
		new THREE.Mesh(
			new THREE.SphereGeometry(15000, 64, 64),
			new THREE.MeshBasicMaterial({
				map: TL.load(P + "8k_stars.jpg"),
				side: THREE.BackSide,
			}),
		),
	);

	// Particles 100k
	const N = 100000,
		pg = new THREE.BufferGeometry(),
		pp = new Float32Array(N * 3),
		pc = new Float32Array(N * 3);
	for (let i = 0; i < N; i++) {
		pp[i * 3] = (Math.random() - 0.5) * 14000;
		pp[i * 3 + 1] = (Math.random() - 0.5) * 2000;
		pp[i * 3 + 2] = (Math.random() - 0.5) * 8000;
		const c = Math.random() * 0.3;
		pc[i * 3] = 0.4 + c;
		pc[i * 3 + 1] = 0.5 + c;
		pc[i * 3 + 2] = 0.7 + c;
	}
	pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
	pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
	scene.add(
		new THREE.Points(
			pg,
			new THREE.PointsMaterial({
				size: 0.7,
				vertexColors: true,
				transparent: true,
				opacity: 0.3,
				blending: THREE.AdditiveBlending,
			}),
		),
	);

	// ANIMATE
	function anim(t) {
		requestAnimationFrame(anim);
		const ts = t * 0.001;
		sunTime.value = ts;
		PLANETS.forEach((p) => {
			const b = B[p.id];
			if (!b) return;
			b.mesh.rotation.y += b.rot;
			if (b.speed > 0) b.orbGroup.rotation.y = ts * b.speed * 60;
		});
		// Moons orbit
		allMoonMeshes.forEach((m) => {
			const d = m.userData;
			m.position.x = Math.cos(ts * d.orbitSpeed) * d.orbitDist;
			m.position.z = Math.sin(ts * d.orbitSpeed) * d.orbitDist;
			m.rotation.y += 0.005;
		});
		// Halley elliptical orbit
		if (cometGroup) {
			const a = 1500,
				b2 = 600,
				angle = ts * 0.02;
			cometGroup.position.x = Math.cos(angle) * a;
			cometGroup.position.z = Math.sin(angle) * b2;
			cometGroup.position.y = Math.sin(angle * 0.3) * 80;
			cometGroup.lookAt(0, 0, 0);
			cometGroup.rotateY(Math.PI);
		}
		controls.update();
		composer.render();
	}
	anim(0);
	window.addEventListener("resize", () => {
		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(innerWidth, innerHeight);
		composer.setSize(innerWidth, innerHeight);
	});
}

// DOTS
const dotsC = document.getElementById("dots");
D.forEach((_, i) => {
	const d = document.createElement("div");
	d.className = "dot" + (i === 0 ? " act" : "");
	d.onclick = () => nav(i - idx);
	dotsC.appendChild(d);
});
function updDots() {
	document
		.querySelectorAll(".dot")
		.forEach((d, i) => d.classList.toggle("act", i === idx));
}

function uiUpdate(i) {
	const d = D[i];
	document.getElementById("hero").classList.toggle("vis", d.type === "hero");
	document.getElementById("card").classList.toggle("vis", d.type === "card");
	if (d.type === "card") {
		document.getElementById("ck").innerText = d.k;
		document.getElementById("ct").innerText = d.t;
		document.getElementById("cd").innerText = d.d;
		const dr = document.getElementById("dr");
		dr.innerHTML = "";
		if (d.data)
			d.data.forEach((s) => {
				const sp = document.createElement("span");
				sp.textContent = s;
				dr.appendChild(sp);
			});
		// WYSIWYG: 恢复已保存的编辑
		const saved = JSON.parse(localStorage.getItem("phantom_edits") || "{}");
		if (saved[d.id]) {
			const s = saved[d.id];
			if (s.t) document.getElementById("ct").innerText = s.t;
			if (s.d) document.getElementById("cd").innerText = s.d;
		}
	}
	updDots();
}

// === WYSIWYG 双击编辑 ===
function initWYSIWYG() {
	["ct", "cd"].forEach((id) => {
		const el = document.getElementById(id);
		el.addEventListener("dblclick", () => {
			el.contentEditable = "true";
			el.focus();
			el.style.outline = "1px solid var(--accent)";
			el.style.cursor = "text";
		});
		el.addEventListener("blur", () => {
			el.contentEditable = "false";
			el.style.outline = "none";
			el.style.cursor = "default";
			const d = D[idx];
			if (!d || d.type !== "card") return;
			const saved = JSON.parse(localStorage.getItem("phantom_edits") || "{}");
			if (!saved[d.id]) saved[d.id] = {};
			if (id === "ct") saved[d.id].t = el.innerText;
			if (id === "cd") saved[d.id].d = el.innerText;
			localStorage.setItem("phantom_edits", JSON.stringify(saved));
		});
		el.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				el.blur();
				e.preventDefault();
			}
			if (e.key === "Enter" && id === "ct") {
				el.blur();
				e.preventDefault();
			}
		});
	});
}
initWYSIWYG();

function focusCam(i) {
	const d = D[i];
	const tc = new THREE.Vector3(0, 600, 1800),
		tl = new THREE.Vector3(0, 0, 0);
	if (d.type === "card" && B[d.id]) {
		const b = B[d.id];
		const wp = new THREE.Vector3();
		b.planetGroup.getWorldPosition(wp);
		tc.set(wp.x + b.r * 3, b.r * 1.5, wp.z + b.r * 3);
		tl.copy(wp);
	}
	if (d.id === "outro") {
		tc.set(600, 400, 2000);
		tl.set(400, 0, 0);
	}
	gsap.to(camera.position, {
		x: tc.x,
		y: tc.y,
		z: tc.z,
		duration: 2.2,
		ease: "power3.inOut",
	});
	gsap.to(controls.target, {
		x: tl.x,
		y: tl.y,
		z: tl.z,
		duration: 2.2,
		ease: "power3.inOut",
		onComplete: () => (moving = false),
	});
}

function nav(dir) {
	if (moving) return;
	let n = idx + dir;
	if (n < 0) n = 0;
	if (n >= D.length) n = D.length - 1;
	if (n === idx) return;
	moving = true;
	idx = n;
	document.getElementById("hero").classList.remove("vis");
	document.getElementById("card").classList.remove("vis");
	setTimeout(() => {
		uiUpdate(idx);
		focusCam(idx);
	}, 350);
}

document.getElementById("bn").onclick = () => nav(1);
document.getElementById("bp").onclick = () => nav(-1);
window.addEventListener("keydown", (e) => {
	if (e.key === "ArrowRight" || e.key === " ") nav(1);
	if (e.key === "ArrowLeft") nav(-1);
});
window.addEventListener(
	"wheel",
	(e) => {
		if (!moving && Math.abs(e.deltaY) > 60) nav(e.deltaY > 0 ? 1 : -1);
	},
	{ passive: true },
);

init();
