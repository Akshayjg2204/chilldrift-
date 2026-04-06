# 🏎️ Chill Drift - 3D Browser Racing Game

![Chill Drift Preview](https://chill-drift.netlify.app/image.png)<img width="1919" height="911" alt="image" src="https://github.com/user-attachments/assets/8024169a-ea7f-4a7a-8924-1deb98d15cf4" />


> A high-octane, browser-based 3D drifting game featuring the legendary AE86. Built with Three.js for immersive graphics and smooth physics.

**[Play Now](https://chill-drift.netlify.app/) | [Source Code](https://github.com/Akshayjg2204/chill-drift) | [Report Bug](https://github.com/Akshayjg2204/chill-drift/issues)**

## ✨ Overview

Chill Drift is a technical showcase of 3D rendering and physics in the browser. Players can control a detailed AE86 model, drifting through a procedurally textured environment with realistic lighting, shadows, and skybox elements.

### Key Features
* **Realistic 3D Modeling:** Features a high-quality GLTF model of the Toyota AE86.
* **Physics-Based Movement:** Custom-coded car physics for a satisfying "drift" feel.
* **Immersive Environment:** Uses high-resolution textures for road surfaces (diffuse, normal, and roughness maps) and grass.
* **Dynamic Atmosphere:** Custom cloud rendering and lighting system for a "chill" aesthetic.
* **High Performance:** Powered by Vite for lightning-fast load times and smooth 60 FPS gameplay.

## 🛠️ Tech Stack

* **Engine:** [Three.js](https://threejs.org/) (WebGL)
* **Build Tool:** [Vite](https://vitejs.dev/)
* **Language:** JavaScript (ES6+)
* **3D Formats:** GLTF / GLB
* **Deployment:** Netlify

## 🚀 Getting Started

To run the game locally for development or curiosity, follow these steps.

### Prerequisites

Make sure you have Node.js installed.

    npm install -g pnpm

### Installation

1. **Clone the repository:**

    git clone https://github.com/Akshayjg2204/chill-drift.git

2. **Navigate to the project directory:**

    cd chill-drift

3. **Install dependencies:**

    pnpm install

4. **Start the development server:**

    pnpm dev

The game will be available at http://localhost:5173.

## 📂 Project Structure

    ├── public/              # Static assets (3D models & textures)
    │   ├── clouds/          # Cloud PNG assets for atmosphere
    │   ├── models/          # 3D assets (ae86.glb)
    │   └── textures/        # Road and grass materials
    ├── src/                 # Game logic source files
    │   └── main.js          # Core Three.js scene and car logic
    ├── index.html           # Canvas entry point
    ├── vite.config.js       # Vite configuration
    ├── package.json         # Dependencies and scripts
    └── README.md            # Project documentation

## 🎮 Controls

* **W / Up Arrow:** Accelerate
* **S / Down Arrow:** Brake / Reverse
* **A / Left Arrow:** Turn Left
* **D / Right Arrow:** Turn Right
* **Space:** Handbrake (Drift)

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
