/**
 * Phantom Motion Engine v11.0 (Hybrid Stage)
 * Quantum Order Prototype
 */

const CONFIG = {
	particleCount: 256 * 256, // 约 6.5万个，演示用，生产可调至 512*512
	chaos: 1.0,
	entangle: 0.0,
	color: "#ffffff",
};

class QuantumEngine {
	constructor() {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.1,
			1000,
		);
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		document.getElementById("app").appendChild(this.renderer.domElement);

		this.camera.position.z = 5;
		this.initParticles();
		this.setupBridge();
		this.animate();

		window.addEventListener("resize", () => this.onResize());
	}

	initParticles() {
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(CONFIG.particleCount * 3);
		const randoms = new Float32Array(CONFIG.particleCount);

		for (let i = 0; i < CONFIG.particleCount; i++) {
			positions[i * 3] = (Math.random() - 0.5) * 10;
			positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
			positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
			randoms[i] = Math.random();
		}

		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("random", new THREE.BufferAttribute(randoms, 1));

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uChaos: { value: CONFIG.chaos },
				uEntangle: { value: CONFIG.entangle },
				uColor: { value: new THREE.Color(CONFIG.color) },
			},
			vertexShader: `
                uniform float uTime;
                uniform float uChaos;
                uniform float uEntangle;
                attribute float random;
                varying float vOpacity;

                void main() {
                    vec3 pos = position;
                    
                    // Chaos: FBM-like noise motion
                    float t = uTime * 0.5 + random * 10.0;
                    pos.x += sin(t * 1.2) * uChaos * random;
                    pos.y += cos(t * 0.8) * uChaos * random;
                    pos.z += sin(t * 1.5) * uChaos * random;

                    // Entangle: Pull towards center
                    pos = mix(pos, vec3(0.0), uEntangle * random);

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = (2.0 / -mvPosition.z) * (1.0 + random);
                    vOpacity = 0.8 * (1.0 - uEntangle * 0.5);
                }
            `,
			fragmentShader: `
                uniform vec3 uColor;
                varying float vOpacity;
                void main() {
                    float d = distance(gl_PointCoord, vec2(0.5));
                    if(d > 0.5) discard;
                    gl_FragColor = vec4(uColor, vOpacity * (1.0 - d * 2.0));
                }
            `,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});

		this.points = new THREE.Points(geometry, this.material);
		this.scene.add(this.points);
	}

	setupBridge() {
		window.addEventListener("message", (event) => {
			const { type, payload } = event.data;
			if (type === "UPDATE_PROP") {
				const { key, value } = payload;
				if (
					this.material.uniforms[
						`u${key.charAt(0).toUpperCase() + key.slice(1)}`
					]
				) {
					gsap.to(
						this.material.uniforms[
							`u${key.charAt(0).toUpperCase() + key.slice(1)}`
						],
						{
							value: value,
							duration: 0.8,
							ease: "expo.out",
						},
					);
				}
			}
		});
	}

	onResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	animate() {
		requestAnimationFrame(() => this.animate());
		this.material.uniforms.uTime.value += 0.01;
		this.points.rotation.y += 0.001 * CONFIG.chaos;
		this.renderer.render(this.scene, this.camera);
	}
}

new QuantumEngine();
