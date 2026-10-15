# 🏎️ Chill Drift — 3D Browser Racing & Drift Game

<div align="center">
  <p align="center">
    <b>A high-octane 3D browser drifting game featuring the legendary Toyota AE86.</b><br>
    Engineered with Three.js (WebGL), custom vehicle physics, procedural environments, and Vite.
  </p>

  <p align="center">
    <a href="https://chill-drift.netlify.app/" target="_blank"><img src="https://img.shields.io/badge/Play_Now-chill--drift.netlify.app-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" alt="Play Now" /></a>
    &nbsp;
    <a href="https://github.com/Akshayjg2204/chilldrift-"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="Repository" /></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=threedotjs&logoColor=white" />
    <img src="https://img.shields.io/badge/WebGL-990000?style=flat-square&logo=webgl&logoColor=white" />
    <img src="https://img.shields.io/badge/Vite_7-646CFF?style=flat-square&logo=vite&logoColor=white" />
    <img src="https://img.shields.io/badge/JavaScript_ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black" />
    <img src="https://img.shields.io/badge/Simplex_Noise-3178C6?style=flat-square" />
    <img src="https://img.shields.io/badge/60_FPS_Ready-88CE02?style=flat-square" />
  </p>
</div>

---

## 🎮 Gameplay & Visual Showcase

<div align="center">
  <a href="https://chill-drift.netlify.app/">
    <img src="./public/preview.png" alt="Chill Drift 3D Gameplay Preview" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.35);" />
  </a>
  <p align="center">
    <sub><b>✨ Real-time WebGL rendering with procedural skybox, high-res PBR road shaders, and AE86 physics.</b></sub><br>
    <b><a href="https://chill-drift.netlify.app/">🚀 Launch Game in Browser</a></b>
  </p>
</div>

---

## 🕹️ Game Controls

| Key | Action | Function |
| :--- | :--- | :--- |
| **`W` / `↑`** | **Accelerate** | Drive forward with progressive throttle acceleration curve |
| **`S` / `↓`** | **Brake / Reverse** | Apply primary disc brakes or engage reverse gear |
| **`A` / `←`** | **Steer Left** | Turn front steering knuckles left with counter-steering assist |
| **`D` / `→`** | **Steer Right** | Turn front steering knuckles right with counter-steering assist |
| **`SPACE`** | **Handbrake** | Lock rear axle to break traction and initiate lateral drift |

---

## ✨ Design & Engineering Highlights

- **🏎️ High-Fidelity AE86 GLTF Model:** Incorporates a detailed 3D model of the iconic Toyota AE86 Sprinter Trueno with separated steering knuckles, rotating wheel meshes, and brake disc assemblies.
- **⚡ Custom Arcade Drift Physics:** Physics engine simulating tire grip coefficients, lateral friction loss under handbrake braking, weight transfer, and inertia-driven counter-steering dynamics.
- **🛣️ Procedural PBR Terrain & Track:** Dynamic terrain generation utilizing Simplex Noise algorithms paired with multi-map PBR shaders (diffuse, normal, and roughness maps) for realistic tarmac light scattering.
- **☁️ Volumetric Dynamic Atmosphere:** Custom procedural cloud generation and directional sun lighting system casting dynamic real-time shadows onto the vehicle and environment.
- **🚀 60 FPS WebGL Optimization:** Lean asset pipeline bundled with Vite for near-instant boot times and rock-solid 60 FPS rendering in modern desktop browsers.

---

## 🛠️ Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **Three.js** | Core WebGL scene graph, camera orchestration, shaders, and lighting |
| **Vite** | Modern lightning-fast build pipeline and local dev server |
| **Simplex Noise** | Mathematical procedural algorithm for terrain elevation and cloud seeding |
| **GLTF / GLB** | Optimized binary 3D vehicle assets with compressed geometry and textures |
| **CSS3 & Glassmorphism** | Floating heads-up display (HUD), speedometer, and controls overlay |
| **Netlify** | Edge CDN deployment and asset delivery |

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 18+ or 20+
- pnpm or npm

```bash
# 1. Clone the repository
git clone https://github.com/Akshayjg2204/chilldrift-.git
cd chilldrift-

# 2. Install dependencies
pnpm install
# or: npm install

# 3. Start development server
pnpm dev
# or: npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to play the game locally.

### Building for Production
```bash
pnpm build
# or: npm run build
```

---

## 👨‍💻 Author

**Akshay Gaikwad**  
Founder & Lead Engineer at [Streamline.dev](https://github.com/Streamline-dev0)  
- 🌐 Portfolio: [stream-line.dev](https://stream-line.dev/)  
- 💼 LinkedIn: [linkedin.com/in/akshayjgaikwad](https://www.linkedin.com/in/akshayjgaikwad/)  
- 🐙 GitHub: [@Akshayjg2204](https://github.com/Akshayjg2204)  
