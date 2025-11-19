import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';

// Cloud system configuration
const CLOUD_CONFIG = {
    STATIC: {
        MIN_HEIGHT: 800,
        MAX_HEIGHT: 1200,
        MIN_DISTANCE: 1000,
        MAX_DISTANCE: 3000,
        CLOUD_COUNT: 30,
        CLOUD_SCALE: { min: 900, max: 1800 },
        OPACITY: { min: 0.2, max: 0.4 }
    },
    DYNAMIC: {
        MIN_HEIGHT: 400,
        MAX_HEIGHT: 800,
        MIN_DISTANCE: 500,
        MAX_DISTANCE: 2000,
        CLOUD_COUNT: 20,
        CLOUD_SCALE: { min: 600, max: 1200 },
        OPACITY: { min: 0.15, max: 0.3 },
        SPAWN_DISTANCE: 1500,  // Distance ahead to spawn new clouds
        DESPAWN_DISTANCE: 2000 // Distance behind to remove clouds
    },
    UPDATE_THRESHOLD: 400, // Reduced threshold for more frequent updates
    TRANSITION_DURATION: 2.0,
    CHUNK_SIZE: 2000,
    CHUNKS_AHEAD: 5,  // Increased from 2 for better sky coverage
    CHUNKS_BEHIND: 3  // Increased from 1 for better sky coverage
};

class SlowRoadCloudSystem {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            ...options,
            chunkSize: options.chunkSize || CLOUD_CONFIG.CHUNK_SIZE
        };

        // Cloud groups
        this.staticCloudGroup = new THREE.Group();
        this.dynamicCloudGroup = new THREE.Group();
        this.transitionCloudGroup = new THREE.Group();

        // Setup
        this.textureLoader = new THREE.TextureLoader();
        this.cloudTextures = [];
        this.lastCarPosition = new THREE.Vector3();
        this.camera = null;
        this.transitionStartTime = 0;
        this.isTransitioning = false;

        // Cloud chunk management
        this.cloudChunks = new Map(); // Map of chunk coordinates to cloud groups
        this.currentChunk = new THREE.Vector2();

        // Initialize cloud groups
        this.scene.add(this.staticCloudGroup);
        this.scene.add(this.dynamicCloudGroup);
        this.scene.add(this.transitionCloudGroup);
    }

    async loadTextures() {
        try {
            const textures = await Promise.all([
                this.loadTexture('/clouds/cloud1.png'),
                this.loadTexture('/clouds/cloud2.png')
            ]);
            this.cloudTextures = textures;
            console.log('Cloud textures loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading cloud textures:', error);
            return false;
        }
    }

    loadTexture(path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    texture.premultiplyAlpha = true;
                    resolve(texture);
                },
                undefined,
                (error) => reject(error)
            );
        });
    }

    setCamera(camera) {
        this.camera = camera;
    }

    createCloudMaterial(opacity, isStatic = false, hasGlow = false) {
        const texture = this.cloudTextures[Math.floor(Math.random() * this.cloudTextures.length)];
        
        if (hasGlow) {
            // Glowing cloud material - subtle glow with reduced intensity
            return new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: opacity * 0.9, // Reduced from 1.3 for subtler glow
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending, // Changed from AdditiveBlending for softer effect
                fog: true,
                emissive: new THREE.Color(0xffffff),
                emissiveIntensity: 0.3 // Reduced from 1.2 to 0.3 for subtle glow
            });
        } else {
            return new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: opacity,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                blending: isStatic ? THREE.NormalBlending : THREE.NormalBlending,
                fog: true
            });
        }
    }

    createCloud(position, config, isStatic = false) {
        const width = config.CLOUD_SCALE.min +
            Math.random() * (config.CLOUD_SCALE.max - config.CLOUD_SCALE.min);
        const height = width * (0.5 + Math.random() * 0.3);

        const geometry = new THREE.PlaneGeometry(width, height);
        const opacity = config.OPACITY.min +
            Math.random() * (config.OPACITY.max - config.OPACITY.min);
        
        // Determine if cloud should glow - lower chance overall for more subtle effect
        // Right side clouds: 30% chance, Left side: 10% chance
        const isRightSide = position.x > 0;
        const glowChance = isRightSide ? 0.3 : 0.1;
        const hasGlow = Math.random() < glowChance;
        
        const material = this.createCloudMaterial(opacity, isStatic, hasGlow);

        const cloud = new THREE.Mesh(geometry, material);
        cloud.position.copy(position);
        cloud.rotation.y = Math.random() * Math.PI * 2;

        if (hasGlow) {
            // Glowing clouds are bright white with slight color tint - more subtle
            const topColor = new THREE.Color(0xffffff);     // Pure white for glow
            const bottomColor = new THREE.Color(0xfff0ff);  // Slightly warm white
            const minH = config.MIN_HEIGHT;
            const maxH = config.MAX_HEIGHT;
            const t = Math.max(0, Math.min(1, (position.y - minH) / (maxH - minH)));
            const tint = bottomColor.clone().lerp(topColor, t);
            material.color.copy(tint);
        } else {
            // Apply dusk gradient tint to non-glowing clouds based on height
            const topColor = new THREE.Color(0x7a2cff);     // Deep purple
            const bottomColor = new THREE.Color(0xff5aa8);  // Pink/magenta near horizon
            const minH = config.MIN_HEIGHT;
            const maxH = config.MAX_HEIGHT;
            const t = Math.max(0, Math.min(1, (position.y - minH) / (maxH - minH)));
            const tint = bottomColor.clone().lerp(topColor, t);
            material.color.copy(tint);
        }

        // Store animation and transition properties
        cloud.userData = {
            originalY: position.y,
            amplitude: 5 + Math.random() * 5,
            frequency: 0.1 + Math.random() * 0.1,
            phase: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.001,
            baseOpacity: opacity,
            targetOpacity: opacity,
            hasGlow: hasGlow // Store glow state
        };

        return cloud;
    }

    createStaticClouds() {
        this.staticCloudGroup.clear();
        const config = CLOUD_CONFIG.STATIC;

        for (let i = 0; i < config.CLOUD_COUNT; i++) {
            const angle = (i / config.CLOUD_COUNT) * Math.PI * 2;
            const distance = config.MIN_DISTANCE +
                Math.random() * (config.MAX_DISTANCE - config.MIN_DISTANCE);

            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = config.MIN_HEIGHT +
                Math.random() * (config.MAX_HEIGHT - config.MIN_HEIGHT);

            const position = new THREE.Vector3(x, y, z);
            const cloud = this.createCloud(position, config, true);
            this.staticCloudGroup.add(cloud);
        }
    }

    getChunkCoord(position) {
        return new THREE.Vector2(
            Math.floor(position.x / CLOUD_CONFIG.CHUNK_SIZE),
            Math.floor(position.z / CLOUD_CONFIG.CHUNK_SIZE)
        );
    }

    generateCloudChunk(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        if (this.cloudChunks.has(chunkKey)) {
            return this.cloudChunks.get(chunkKey);
        }

        const chunkGroup = new THREE.Group();
        const config = CLOUD_CONFIG.DYNAMIC;
        const chunkCenterX = (chunkX + 0.5) * CLOUD_CONFIG.CHUNK_SIZE;
        const chunkCenterZ = (chunkZ + 0.5) * CLOUD_CONFIG.CHUNK_SIZE;

        // Generate random clouds within the chunk
        const cloudCount = Math.floor(config.CLOUD_COUNT * (0.8 + Math.random() * 0.4));
        for (let i = 0; i < cloudCount; i++) {
            const x = chunkCenterX + (Math.random() - 0.5) * CLOUD_CONFIG.CHUNK_SIZE;
            const z = chunkCenterZ + (Math.random() - 0.5) * CLOUD_CONFIG.CHUNK_SIZE;
            const y = config.MIN_HEIGHT + Math.random() * (config.MAX_HEIGHT - config.MIN_HEIGHT);

            const position = new THREE.Vector3(x, y, z);
            const cloud = this.createCloud(position, config);
            chunkGroup.add(cloud);
        }

        this.cloudChunks.set(chunkKey, chunkGroup);
        this.dynamicCloudGroup.add(chunkGroup);
        return chunkGroup;
    }

    removeCloudChunk(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.cloudChunks.get(chunkKey);
        if (chunk) {
            this.dynamicCloudGroup.remove(chunk);
            chunk.children.forEach(cloud => {
                cloud.geometry.dispose();
                cloud.material.dispose();
            });
            chunk.clear();
            this.cloudChunks.delete(chunkKey);
        }
    }

    updateChunks(carPosition) {
        const newChunk = this.getChunkCoord(carPosition);

        // If we haven't moved to a new chunk, no need to update
        if (newChunk.equals(this.currentChunk)) {
            return;
        }

        // Calculate chunk range to keep
        const minX = newChunk.x - CLOUD_CONFIG.CHUNKS_BEHIND;
        const maxX = newChunk.x + CLOUD_CONFIG.CHUNKS_AHEAD;
        const minZ = newChunk.y - CLOUD_CONFIG.CHUNKS_BEHIND;
        const maxZ = newChunk.y + CLOUD_CONFIG.CHUNKS_AHEAD;

        // Remove out-of-range chunks
        for (const [key, chunk] of this.cloudChunks.entries()) {
            const [x, z] = key.split(',').map(Number);
            if (x < minX || x > maxX || z < minZ || z > maxZ) {
                this.removeCloudChunk(x, z);
            }
        }

        // Generate new chunks in range
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                this.generateCloudChunk(x, z);
            }
        }

        this.currentChunk.copy(newChunk);
    }

    startCloudTransition(carPosition) {
        // Move current dynamic clouds to transition group
        while (this.dynamicCloudGroup.children.length > 0) {
            const cloud = this.dynamicCloudGroup.children[0];
            cloud.userData.targetOpacity = 0; // Fade out
            this.transitionCloudGroup.add(cloud);
        }

        // Create new dynamic clouds
        this.createDynamicClouds(carPosition);

        // Set new clouds to start invisible and fade in
        this.dynamicCloudGroup.children.forEach(cloud => {
            cloud.material.opacity = 0;
            cloud.userData.baseOpacity = 0;
            cloud.userData.targetOpacity = cloud.userData.originalOpacity || cloud.userData.baseOpacity;
        });

        this.transitionStartTime = performance.now() / 1000;
        this.isTransitioning = true;
    }

    updateCloudTransitions(time) {
        if (!this.isTransitioning) return;

        const elapsed = time - this.transitionStartTime;
        const progress = Math.min(1, elapsed / CLOUD_CONFIG.TRANSITION_DURATION);

        // Fade out old clouds
        this.transitionCloudGroup.children.forEach(cloud => {
            cloud.material.opacity = cloud.userData.baseOpacity * (1 - progress);
        });

        // Fade in new clouds
        this.dynamicCloudGroup.children.forEach(cloud => {
            cloud.material.opacity = cloud.userData.targetOpacity * progress;
        });

        // Clean up when transition is complete
        if (progress >= 1) {
            while (this.transitionCloudGroup.children.length > 0) {
                const cloud = this.transitionCloudGroup.children[0];
                this.transitionCloudGroup.remove(cloud);
                cloud.geometry.dispose();
                cloud.material.dispose();
            }
            this.isTransitioning = false;
        }
    }

    update(carPosition, time) {
        if (!this.camera) {
            console.warn('Camera not set in cloud system');
            return;
        }

        // Update cloud chunks based on car position
        this.updateChunks(carPosition);

        // Update cloud transitions
        this.updateCloudTransitions(time);

        // Animate all clouds
        const animateGroup = (group) => {
            group.children.forEach(cloudChunk => {
                cloudChunk.children.forEach(cloud => {
                    if (cloud.userData.originalY !== undefined) {
                        // Vertical wave motion
                        cloud.position.y = cloud.userData.originalY +
                            Math.sin(time * cloud.userData.frequency + cloud.userData.phase) *
                            cloud.userData.amplitude;

                        // Make cloud face camera
                        cloud.lookAt(this.camera.position);
                        cloud.rotation.x = Math.PI / 2;

                        // Add slight rotation for dynamic effect
                        cloud.rotation.z += cloud.userData.rotationSpeed;
                    }
                });
            });
        };

        animateGroup(this.dynamicCloudGroup);
        animateGroup(this.staticCloudGroup);
        animateGroup(this.transitionCloudGroup);
    }

    init(initialPosition = new THREE.Vector3()) {
        // Create initial static clouds
        this.createStaticClouds();

        // Generate initial dynamic cloud chunks
        const chunk = this.getChunkCoord(initialPosition);
        this.currentChunk.copy(chunk);

        // Generate initial chunks around the starting position
        for (let x = chunk.x - CLOUD_CONFIG.CHUNKS_BEHIND; x <= chunk.x + CLOUD_CONFIG.CHUNKS_AHEAD; x++) {
            for (let z = chunk.y - CLOUD_CONFIG.CHUNKS_BEHIND; z <= chunk.y + CLOUD_CONFIG.CHUNKS_AHEAD; z++) {
                this.generateCloudChunk(x, z);
            }
        }

        this.lastCarPosition.copy(initialPosition);
    }

    dispose() {
        // Clear all cloud chunks
        for (const [key, chunk] of this.cloudChunks.entries()) {
            const [x, z] = key.split(',').map(Number);
            this.removeCloudChunk(x, z);
        }
        this.cloudChunks.clear();

        // Dispose of static clouds
        const disposeGroup = (group) => {
            while (group.children.length > 0) {
                const cloud = group.children[0];
                group.remove(cloud);
                if (cloud.geometry) cloud.geometry.dispose();
                if (cloud.material) cloud.material.dispose();
            }
        };

        disposeGroup(this.staticCloudGroup);
        disposeGroup(this.dynamicCloudGroup);
        disposeGroup(this.transitionCloudGroup);

        this.scene.remove(this.staticCloudGroup);
        this.scene.remove(this.dynamicCloudGroup);
        this.scene.remove(this.transitionCloudGroup);
    }
}

class CloudManager {

    constructor() {
        this.cloudSystem = null;
        this.lastUpdatePosition = new THREE.Vector3();
    }

    async initialize(scene, camera, initialPosition, chunkSize) {
        // Create and initialize the cloud system
        this.cloudSystem = new SlowRoadCloudSystem(scene, {
            chunkSize: chunkSize || 2000
        });
        this.cloudSystem.setCamera(camera);
        
        // Load cloud textures
        const texturesLoaded = await this.cloudSystem.loadTextures();
        if (!texturesLoaded) {
            console.error('Failed to load cloud textures');
            return false;
        }
        
        // Initialize clouds at the initial position
        this.cloudSystem.init(initialPosition);
        this.lastUpdatePosition.copy(initialPosition);
        
        return true;
    }

    update(carPosition, timestamp) {
        if (this.cloudSystem) {
            this.cloudSystem.update(carPosition, timestamp / 1000);
        }
    }

    dispose() {
        if (this.cloudSystem) {
            this.cloudSystem.dispose();
            this.cloudSystem = null;
        }
    }
}

// Create a singleton instance
const cloudManager = new CloudManager();
export default cloudManager; 
    
    


// Road chunk system classes
class RoadChunk {
    constructor(position, size = 500) {
        this.position = position;
        this.size = size;
        this.mesh = null;
        this.roadMesh = null;
        this.roadLines = null;
        this.roadPoints = [];
        this.staticStartPoint = null;
        this.staticDirection = null;
        this.previousChunk = null;
        this.nextChunk = null;
        this.boundaryHeights = new Map();
        this.curveParameters = null; // Store curve parameters for terrain continuity
        this.staticTerrainHeightFunc = null; // Function to get static terrain height
        this.baseHeight = 0; // Added to store base height for height continuity
    }

    smootherstep(min, max, value) {
        const x = Math.max(0, Math.min(1, (value-min)/(max-min)));
        // Quintic interpolation for smoother transitions
        return x * x * x * (x * (x * 6 - 15) + 10);
    }

    smoothstep(min, max, value) {
        const x = Math.max(0, Math.min(1, (value-min)/(max-min)));
        return x * x * (3 - 2 * x);
    }

    initializeFromStaticRoad(startPoint, direction) {
        this.staticStartPoint = startPoint.clone();
        this.staticDirection = direction.clone();
    }

    calculateCurveParameters(x, z) {
        const chunkZ = this.position.z;
        
        // If this is the first chunk and we have static terrain data
        if (this.staticTerrainHeightFunc && chunkZ - this.size/2 <= this.staticEndZ) {
            // Get the static terrain parameters at the boundary
            const staticZ = this.staticEndZ;
            const samplingPoints = 5;
            let staticProfile = [];
            
            // Sample static terrain heights with wider sampling range
            for (let i = 0; i < samplingPoints; i++) {
                const sampleX = x - 400 + (i * 200);
                const height = this.staticTerrainHeightFunc(sampleX, staticZ);
                staticProfile.push({ x: sampleX, height });
            }
            
            // Calculate amplitude and phase to match static terrain
            let maxHeight = -Infinity;
            let minHeight = Infinity;
            staticProfile.forEach(point => {
                maxHeight = Math.max(maxHeight, point.height);
                minHeight = Math.min(minHeight, point.height);
            });
            
            const amplitude = (maxHeight - minHeight) / 2;
            const baseHeight = (maxHeight + minHeight) / 2;
            
            // Calculate phase to match static terrain slope
            const slope = (staticProfile[samplingPoints-1].height - staticProfile[0].height) / 
                         (staticProfile[samplingPoints-1].x - staticProfile[0].x);
            const phase = Math.atan2(slope, 1);
            
            return {
                amplitude: Math.max(amplitude, 400), // Increased base amplitude
                frequency: Math.PI * 0.8,
                phase: phase,
                baseHeight: baseHeight,
                x: x,
                z: (z - staticZ) / this.size,
                // Add multiple mountain parameters
                mountainOffsets: [
                    { x: 200, z: 0, scale: 1.0 },
                    { x: -300, z: 200, scale: 0.8 },
                    { x: 400, z: -150, scale: 0.9 },
                    { x: -150, z: -300, scale: 0.7 }
                ]
            };
        }
        
        // For other chunks, use enhanced mountain generation parameters
        const normalizedZ = (z - chunkZ) / this.size;
        const baseFreq = Math.PI * 0.8;
        const phase = (chunkZ / this.size) * baseFreq;
        
        return {
            amplitude: 400, // Increased base amplitude
            frequency: baseFreq,
            phase: phase,
            baseHeight: 0,
            x: x,
            z: normalizedZ,
            // Add multiple mountain parameters with varied positions and scales
            mountainOffsets: [
                { x: 200, z: 0, scale: 1.0 },
                { x: -300, z: 200, scale: 0.8 },
                { x: 400, z: -150, scale: 0.9 },
                { x: -150, z: -300, scale: 0.7 }
            ]
        };
    }

    getTerrainCurve(params, side) {
        const { amplitude, frequency, phase, baseHeight, x, z, mountainOffsets } = params;
        
        // Enhanced base curve with multiple frequencies
        const baseCurve = Math.sin(z * frequency + phase) * amplitude +
                         Math.sin(z * frequency * 1.5 + phase * 0.7) * (amplitude * 0.4) +
                         Math.sin(z * frequency * 2.3 + phase * 1.3) * (amplitude * 0.2);
        
        // Dynamic elevation changes
        const elevationFreq = 0.003 + Math.random() * 0.002;
        const elevationPhase = phase * 0.5 + Math.random() * Math.PI;
        const upwardSlope = Math.sin(z * elevationFreq + elevationPhase) * 250;
        
        // Enhanced mountain generation with varied peaks
        let mountainHeight = 0;
        
        mountainOffsets.forEach(mountain => {
            const dx = (x - mountain.x) / (250 + Math.random() * 100);
            const dz = (z * this.size - mountain.z) / (250 + Math.random() * 100);
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Variable peak height
            const peakHeight = Math.max(0, 1 - distance) * amplitude * (1.3 + Math.random() * 0.4) * mountain.scale;
            mountainHeight = Math.max(mountainHeight, peakHeight);
            
            // Add varied sub-peaks
            const subPeaks = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < subPeaks; i++) {
                const subOffset = (80 + Math.random() * 40) * (i + 1);
                const angle = (i * Math.PI * 2/subPeaks) + Math.random() * 0.5;
                const subDx = (x - (mountain.x + Math.cos(angle) * subOffset)) / (150 + Math.random() * 100);
                const subDz = (z * this.size - (mountain.z + Math.sin(angle) * subOffset)) / (150 + Math.random() * 100);
                const subDistance = Math.sqrt(subDx * subDx + subDz * subDz);
                const subPeakHeight = Math.max(0, 1 - subDistance) * amplitude * (0.6 + Math.random() * 0.4) * mountain.scale;
                mountainHeight = Math.max(mountainHeight, subPeakHeight);
            }
        });
        
        // Apply side-specific modifications with enhanced variation
        if (side < 0) {
            const valleyFactor = 0.8 + Math.random() * 0.4;
            const baseTerrainHeight = Math.abs(baseCurve) * 1.2 + baseHeight + (20 + Math.random() * 20);
            return Math.max(baseTerrainHeight, mountainHeight * valleyFactor) + upwardSlope;
        } else {
            const mountainFactor = 1.1 + Math.random() * 0.3;
            const mountainSideHeight = Math.abs(baseCurve) * 1.4 + baseHeight + (40 + Math.random() * 20);
            return Math.max(mountainSideHeight, mountainHeight * mountainFactor) + upwardSlope;
        }
    }

    calculateTerrainHeight(x, z, useNeighbors = true) {
        const roadInfo = this.findClosestRoadSegment(x, z);
        if (!roadInfo) return this.calculateBaseTerrainHeight(x, z);

        const { distance, roadHeight, roadDirection, closestPoint } = roadInfo;
        
        const roadWidth = 24;
        const transitionZone = 80; // Increased from 60
        const outerInfluenceZone = 150; // Increased from 120
        
        // Under and near road - match road height exactly with a slight offset
        if (distance <= roadWidth/2 + 4) {
            return roadHeight - 0.5;
        }
        
        // Calculate terrain slope
        const toPoint = new THREE.Vector3(x, 0, z).sub(closestPoint);
        const side = Math.sign(toPoint.dot(new THREE.Vector3(-roadDirection.z, 0, roadDirection.x)));
        
        // Calculate slope height with improved transition
        let slopeHeight = this.calculateTerrainSlope(x, z, closestPoint, roadDirection);
        
        // Enhanced transition from road to terrain with wider blend zone
        if (distance < roadWidth/2 + transitionZone) {
            const t = (distance - roadWidth/2) / transitionZone;
            const smoothT = this.smootherstep(0, 1, t);
            return roadHeight - 0.5 + slopeHeight * smoothT;
        }

        // Add road height to slope height for proper connection
        slopeHeight += roadHeight;

        // Enhanced chunk transition with wider blend zone and increased overlap
        const chunkBoundary = this.size / 2;
        const distanceFromBoundary = Math.abs(Math.abs(z - this.position.z) - chunkBoundary);
        const transitionWidth = 160; // Increased from 120 for wider transitions
        
        if (distanceFromBoundary < transitionWidth && useNeighbors) {
            const blendFactor = this.smootherstep(0, 1, distanceFromBoundary / transitionWidth);
            const neighborHeight = this.getNeighborHeight(x, z, side);
            
            // Enhanced height blending with increased overlap
            const overlapFactor = 0.15; // Increased from 0.1 for more overlap
            const heightDiff = Math.abs(slopeHeight - neighborHeight);
            const overlap = heightDiff * overlapFactor;
            
            // Use enhanced hermite interpolation for smoother transition
            const t = this.smootherstep(0, 1, blendFactor); // Added smootherstep for better blending
            const t2 = t * t;
            const t3 = t2 * t;
            const h1 = 2*t3 - 3*t2 + 1;
            const h2 = -2*t3 + 3*t2;
            
            // Enhanced height blending with slope preservation
            const blendedHeight = slopeHeight * h1 + neighborHeight * h2;
            const finalHeight = Math.max(blendedHeight, Math.min(slopeHeight, neighborHeight) + overlap);
            
            // Add small height offset in transition zone to prevent gaps
            const transitionOffset = 0.5 * (1 - Math.abs(2 * t - 1)); // Peak at transition midpoint
            return finalHeight + transitionOffset;
        }

        return slopeHeight;
    }

    naturalSlope(t) {
        // Custom easing function for smooth, natural slopes
        const t2 = t * t;
        const t3 = t2 * t;
        // Modified curve for natural slope progression
        return t3 * (t * (t * 2 - 5) + 4); // Adjusted for smoother progression
    }

    findClosestRoadSegment(x, z) {
        let minDist = Infinity;
        let result = null;

        for (let i = 0; i < this.roadPoints.length - 1; i++) {
            const p1 = this.roadPoints[i];
            const p2 = this.roadPoints[i + 1];
            
            const roadSegment = new THREE.Line3(p1, p2);
            const closestPoint = new THREE.Vector3();
            roadSegment.closestPointToPoint(new THREE.Vector3(x, 0, z), true, closestPoint);
            
            const dist = new THREE.Vector2(x - closestPoint.x, z - closestPoint.z).length();
            
            if (dist < minDist) {
                const roadDirection = new THREE.Vector3()
                    .subVectors(p2, p1)
                    .normalize();
                const roadNormal = new THREE.Vector3(0, 1, 0);
                
                result = {
                    distance: dist,
                    roadHeight: closestPoint.y,
                    roadDirection: roadDirection,
                    roadNormal: roadNormal,
                    closestPoint: closestPoint,
                    segment: { start: p1, end: p2 }
                };
                minDist = dist;
            }
        }
        
        return result;
    }

    calculateAverageTerrainHeight(x, z, closestPoint, roadDirection) {
        const sampleRadius = 60; // Reduced from 80 for tighter terrain sampling
        const numSamples = 24;
        const samples = [];
        
        // Sample in tighter area for better terrain matching
        for (let ring = 0; ring < 4; ring++) {
            const ringRadius = sampleRadius * (0.4 + ring * 0.3); // Reduced initial scale for tighter sampling
            for (let i = 0; i < numSamples; i++) {
                const angle = (i / numSamples) * Math.PI * 2;
                const sampleX = x + Math.cos(angle) * ringRadius;
                const sampleZ = z + Math.sin(angle) * ringRadius;
                
                const sampleDist = new THREE.Vector2(
                    sampleX - closestPoint.x,
                    sampleZ - closestPoint.z
                ).length();
                
                // Sample closer to road for better terrain matching
                if (sampleDist > 30) { // Reduced from 60 to sample closer to road
                    const height = this.calculateBaseTerrainHeight(sampleX, sampleZ);
                    samples.push(height);
                }
            }
        }
        
        if (samples.length === 0) return this.calculateBaseTerrainHeight(x, z);
        
        // Enhanced height averaging with outlier removal
        samples.sort((a, b) => a - b);
        const validSamples = samples.slice(
            Math.floor(samples.length * 0.2),
            Math.ceil(samples.length * 0.8)
        );
        
        // Use weighted average with stronger weight for higher terrain
        let sum = 0;
        let weightSum = 0;
        const median = validSamples[Math.floor(validSamples.length / 2)];
        
        for (const height of validSamples) {
            // Give more weight to higher terrain values
            const weight = 1 / (1 + Math.abs(height - median)) * (height > median ? 1.5 : 1.0);
            sum += height * weight;
            weightSum += weight;
        }
        
        return sum / weightSum;
    }

    calculateBaseTerrainHeight(x, z) {
        if (this.staticTerrainHeightFunc) {
            const transitionZone = 100;
            
            if (z <= this.staticEndZ) {
                return this.staticTerrainHeightFunc(x, z);
            }
            
            if (z <= this.staticEndZ + transitionZone) {
                const staticHeight = this.staticTerrainHeightFunc(x, this.staticEndZ);
                const autoHeight = this.calculateAutoTerrainHeight(x, z);
                const t = (z - this.staticEndZ) / transitionZone;
                const smoothT = this.smoothstep(0, 1, t);
                
                return THREE.MathUtils.lerp(staticHeight, autoHeight, smoothT);
            }
        }

        return this.calculateAutoTerrainHeight(x, z);
    }
    
    calculateAutoTerrainHeight(x, z) {
        // Safety check for empty or invalid roadPoints
        if (!this.roadPoints || this.roadPoints.length < 2) {
            return -10; // Default height if no road points exist
        }
        
        // Find closest point on road for slope calculation
        let minDistToRoad = Infinity;
        let closestRoadPoint = null;
        let closestDirection = null;
        let roadHeight = 0;
        
        try {
        for (let i = 0; i < this.roadPoints.length - 1; i++) {
            const p1 = this.roadPoints[i];
            const p2 = this.roadPoints[i + 1];
                
                if (!p1 || !p2) continue; // Skip invalid points
            
            const roadSegment = new THREE.Line3(p1, p2);
            const closestPoint = new THREE.Vector3();
            roadSegment.closestPointToPoint(new THREE.Vector3(x, 0, z), true, closestPoint);
            
            const dist = new THREE.Vector2(x - closestPoint.x, z - closestPoint.z).length();
            
            if (dist < minDistToRoad) {
                minDistToRoad = dist;
                closestRoadPoint = closestPoint.clone();
                closestDirection = p2.clone().sub(p1).normalize();
                roadHeight = closestPoint.y;
            }
            }
        } catch (error) {
            console.warn('Error in terrain calculation:', error);
            return -10; // Fallback height
        }
        
        if (!closestRoadPoint || !closestDirection) {
            return -10;
        }
        
        // Enhanced road parameters with exact connection
        const roadWidth = 24;
        const clearanceWidth = 40;
        const baseHeight = roadHeight;
        
        // Create exact connection between road and terrain
        if (minDistToRoad <= clearanceWidth) {
            if (minDistToRoad <= roadWidth/2) {
                return roadHeight - 0.1; // Slightly below road surface
            }
            
            const t = (minDistToRoad - roadWidth/2) / (clearanceWidth - roadWidth/2);
            const smoothT = this.smoothstep(0, 1, t);
            
            const terrainHeight = this.calculateTerrainSlope(x, z, closestRoadPoint, closestDirection);
            return isNaN(terrainHeight) ? roadHeight - 0.1 : 
                   roadHeight - 0.1 + (terrainHeight - (roadHeight - 0.1)) * smoothT;
        }
        
        const terrainHeight = this.calculateTerrainSlope(x, z, closestRoadPoint, closestDirection);
        return isNaN(terrainHeight) ? -10 : terrainHeight;
    }

    calculateTerrainSlope(x, z, closestPoint, roadDirection) {
        const roadWidth = 24;
        const mountainStartDistance = roadWidth/2; // Start immediately from road edge
        const mountainMaxDistance = 200; // Distance for max height/depth
        const maxUpwardHeight = 80; // Reduced from 250 to make mountains lower
        const maxDownwardDepth = -60; // Reduced from -200 to make valleys shallower

        // Calculate distance and side of road
        const toPoint = new THREE.Vector3(x, 0, z).sub(closestPoint);
        const side = Math.sign(toPoint.dot(new THREE.Vector3(-roadDirection.z, 0, roadDirection.x)));
        const distance = toPoint.length();

        // If we're on the road, return 0 (road height will be added later)
        if (distance <= roadWidth/2) return 0;

        // Calculate slope transition
        const t = Math.min((distance - mountainStartDistance) / (mountainMaxDistance - mountainStartDistance), 1);
        const smoothT = this.naturalSlope(t);

        // Left side: downward slope, Right side: upward slope
        let height = 0;
        if (side < 0) { // Left side - downward slope
            height = maxDownwardDepth * smoothT;
            // Add some terrain variation but reduce it near the road
            const variationStrength = Math.min(1, (distance - roadWidth/2) / 40);
            height += Math.sin(x * 0.02 + z * 0.015) * Math.cos(z * 0.02 - x * 0.015) * 8 * smoothT * variationStrength;
        } else { // Right side - upward slope
            height = maxUpwardHeight * smoothT;
            // Add some terrain variation but reduce it near the road
            const variationStrength = Math.min(1, (distance - roadWidth/2) / 40);
            height += Math.sin(x * 0.018 + z * 0.012) * Math.cos(z * 0.018 - x * 0.012) * 10 * smoothT * variationStrength;
        }

        return height;
    }

    getNeighborHeight(x, z, side) {
        // Get height from neighboring chunk for smooth transitions
        const isForward = z > this.position.z;
        const neighborChunk = isForward ? this.nextChunk : this.previousChunk;
        
        if (neighborChunk) {
            // Enhanced sampling with larger grid and weighted averaging
            const samples = [];
            const gridSize = 11; // Increased from 9 for better coverage
            const spacing = 5; // Reduced from 6 for denser sampling
            
            // Calculate base position for sampling grid
            const centerX = x;
            const centerZ = z;
            
            // Sample in a grid pattern with additional diagonal samples
            for (let i = -Math.floor(gridSize/2); i <= Math.floor(gridSize/2); i++) {
                for (let j = -Math.floor(gridSize/2); j <= Math.floor(gridSize/2); j++) {
                    // Add main grid points with offset based on side
                    const sampleX = centerX + i * spacing;
                    const sampleZ = centerZ + j * spacing;
                    
                    // Get height from neighbor chunk with overlap compensation
                    const height = neighborChunk.calculateTerrainHeight(sampleX, sampleZ, false);
                    
                    // Enhanced weighting system with distance-based falloff
                    const distance = Math.sqrt(i*i + j*j);
                    const edgeWeight = this.smootherstep(gridSize/2, 0, distance);
                    const directionWeight = isForward ? 
                        this.smootherstep(-gridSize/2, gridSize/2, j) : 
                        this.smootherstep(gridSize/2, -gridSize/2, j);
                    
                    // Additional weight for points closer to the transition boundary
                    const boundaryDist = Math.abs(sampleZ - this.position.z);
                    const boundaryWeight = this.smootherstep(this.size/2, 0, boundaryDist);
                    
                    // Enhanced distance-based weight calculation
                    const distanceWeight = 1 / (1 + Math.pow(distance, 1.5)); // Adjusted power for smoother falloff
                    const weight = edgeWeight * directionWeight * boundaryWeight * distanceWeight;
                    samples.push({ height, weight });
                    
                    // Add diagonal samples with increased density
                    if (Math.abs(i) + Math.abs(j) > 0) { // Skip center point
                        const diagX = centerX + (i * 0.8 + j * 0.2) * spacing;
                        const diagZ = centerZ + (i * 0.2 + j * 0.8) * spacing;
                        const diagHeight = neighborChunk.calculateTerrainHeight(diagX, diagZ, false);
                        const diagDistance = Math.sqrt(Math.pow(i * 0.8 + j * 0.2, 2) + Math.pow(i * 0.2 + j * 0.8, 2));
                        const diagWeight = edgeWeight * directionWeight * boundaryWeight * (0.8 / (1 + Math.pow(diagDistance, 1.5)));
                        
                        samples.push({ height: diagHeight, weight: diagWeight });
                    }
                }
            }
            
            // Calculate weighted average with enhanced blending
            let totalWeight = 0;
            let weightedHeight = 0;
            let maxHeight = -Infinity;
            let minHeight = Infinity;
            
            // First pass to find height range
            samples.forEach(sample => {
                maxHeight = Math.max(maxHeight, sample.height);
                minHeight = Math.min(minHeight, sample.height);
            });
            
            // Second pass with enhanced height-based weighting
            const heightRange = maxHeight - minHeight;
            const midHeight = (maxHeight + minHeight) / 2;
            
            samples.forEach(sample => {
                // Enhanced weight calculation considering height distribution
                const heightWeight = heightRange > 0 ? 
                    1 - Math.pow(Math.abs(sample.height - midHeight) / heightRange, 2) : // Quadratic falloff
                    1;
                
                const finalWeight = sample.weight * (1 + heightWeight);
                weightedHeight += sample.height * finalWeight;
                totalWeight += finalWeight;
            });
            
            // Add increased overlap to prevent gaps
            const overlapHeight = weightedHeight / totalWeight;
            const currentHeight = this.calculateTerrainHeight(x, z, false);
            const overlapFactor = 0.08; // Increased from 0.05
            
            // Add small height offset in transition zone
            const boundaryDist = Math.abs(z - this.position.z) / (this.size/2);
            const transitionOffset = 0.3 * (1 - Math.abs(2 * boundaryDist - 1));
            
            return Math.max(
                overlapHeight + transitionOffset,
                currentHeight - Math.abs(overlapHeight - currentHeight) * overlapFactor
            );
        }
        
        return this.calculateTerrainHeight(x, z, false);
    }

    generate(scene, previousChunk = null) {
        this.previousChunk = previousChunk;
        if (previousChunk) {
            previousChunk.nextChunk = this;
            
            // Ensure height continuity
            if (previousChunk.roadPoints && previousChunk.roadPoints.length > 0) {
                const lastPoint = previousChunk.roadPoints[previousChunk.roadPoints.length - 1];
                this.baseHeight = lastPoint.y;
            }
        }

        // Generate road points with height continuity
        this.roadPoints = this.generateRoadPoints(previousChunk);
        
        // Store boundary heights for smooth transitions
        const boundaryPoints = 20;
        for (let i = 0; i < boundaryPoints; i++) {
            const x = -this.size/2 + i * (this.size / (boundaryPoints - 1));
            const startZ = this.position.z - this.size/2;
            const endZ = this.position.z + this.size/2;
            
            // Use road height as reference for terrain
            const nearestRoadPoint = this.findNearestRoadPoint(x, startZ);
            const roadHeight = nearestRoadPoint ? nearestRoadPoint.y : this.baseHeight;
            
            this.boundaryHeights.set(`start_${i}`, this.calculateTerrainHeight(x, startZ, false));
            this.boundaryHeights.set(`end_${i}`, this.calculateTerrainHeight(x, endZ, false));
        }

        // Create ground geometry with even more segments for better terrain detail
        const groundGeometry = new THREE.PlaneGeometry(this.size, this.size, 200, 200);
        groundGeometry.rotateX(-Math.PI / 2);
        
        // Apply height calculations to vertices with additional smoothing
        const vertices = groundGeometry.attributes.position;
        const smoothingRadius = 2;
        const heights = new Float32Array(vertices.count);
        
        // Calculate heights with neighbor awareness
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + this.position.x;
            const z = vertices.getZ(i) + this.position.z;
            heights[i] = this.calculateTerrainHeight(x, z, true);
        }
        
        // Apply enhanced smoothing
        for (let i = 0; i < vertices.count; i++) {
            let totalWeight = 0;
            let weightedHeight = 0;
            
            const row = Math.floor(i / 201);
            const col = i % 201;
            
            for (let dr = -smoothingRadius; dr <= smoothingRadius; dr++) {
                for (let dc = -smoothingRadius; dc <= smoothingRadius; dc++) {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    
                    if (newRow >= 0 && newRow < 201 && newCol >= 0 && newCol < 201) {
                        const neighborIndex = newRow * 201 + newCol;
                        const distance = Math.sqrt(dr * dr + dc * dc);
                        const weight = 1 / (1 + distance);
                        
                        weightedHeight += heights[neighborIndex] * weight;
                        totalWeight += weight;
                    }
                }
            }
            
            vertices.setY(i, weightedHeight / totalWeight);
        }
        
        // Apply very subtle height variation (reduced from previous version)
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + this.position.x;
            const z = vertices.getZ(i) + this.position.z;
            const currentHeight = vertices.getY(i);
            
            // Reduced variation scale from 5 to 1 and increased frequency for subtler changes
            const detail = (
                Math.sin(x * 0.05 + z * 0.05) * 
                Math.cos(x * 0.07 - z * 0.04)
            ) * 1;
            
            vertices.setY(i, currentHeight + detail);
        }
        
        // Compute normals for better shading
        groundGeometry.computeVertexNormals();

        // Load grass texture
        const preloadManager = new THREE.LoadingManager();
        preloadManager.onError = (url) => {
            console.error('Error preloading texture:', url);
        };
        const textureLoader = new THREE.TextureLoader(preloadManager);
        const grassTexture = textureLoader.load('grass.jpg');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(60, 60);
        
        const renderer = scene.renderer;
        if (renderer) {
            grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }

        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: grassTexture,
            side: THREE.FrontSide,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: false,
            shadowSide: THREE.FrontSide,
            envMapIntensity: 1.0
        });

        this.mesh = new THREE.Mesh(groundGeometry, groundMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.receiveShadow = true;

        this.generateRoad(scene);
        
        scene.add(this.mesh);
        if (this.roadMesh) scene.add(this.roadMesh);
        if (this.roadLines) scene.add(this.roadLines);
    }

    generateRoadPoints(previousChunk) {
        const points = [];
        const segments = 40;
        const chunkStart = this.position.z - this.size / 2;
        const chunkEnd = this.position.z + this.size / 2;

        // Get starting position and direction from previous chunk
        let startX = 0;
        const roadHeight = 50;
        let prevEndDirection = new THREE.Vector2(0, 1);
        let prevEndCurveType = null;
        let prevEndAmplitude = 0;

        if (this.staticStartPoint) {
            startX = this.staticStartPoint.x;
            prevEndDirection = this.staticDirection ? new THREE.Vector2(this.staticDirection.x, this.staticDirection.z) : new THREE.Vector2(0, 1);
        } else if (previousChunk && previousChunk.roadPoints && previousChunk.roadPoints.length > 2) {
            const numTransitionPoints = 8; // Increased for smoother direction calculation
            const prevPoints = previousChunk.roadPoints.slice(-numTransitionPoints);
            startX = prevPoints[prevPoints.length - 1].x;
            
            // Enhanced direction calculation using weighted average
            const avgDirection = new THREE.Vector2(0, 0);
            for (let i = 1; i < prevPoints.length; i++) {
                const dx = prevPoints[i].x - prevPoints[i-1].x;
                const dz = prevPoints[i].z - prevPoints[i-1].z;
                const weight = i / prevPoints.length; // Progressive weighting
                avgDirection.add(new THREE.Vector2(dx, dz).normalize().multiplyScalar(weight));
            }
            prevEndDirection = avgDirection.normalize();
            
            prevEndCurveType = previousChunk.curveType;
            prevEndAmplitude = previousChunk.currentAmplitude || 0;
        }

        // Smoother curve type selection
        if (prevEndCurveType && prevEndAmplitude) {
            this.curveType = prevEndCurveType;
            this.currentAmplitude = prevEndAmplitude;
        } else {
            const rand = Math.random();
            if (!prevEndCurveType || prevEndCurveType === 'straight') {
                if (rand < 0.3) this.curveType = 'left';
                else if (rand < 0.6) this.curveType = 'right';
                else this.curveType = 'straight';
            } else if (prevEndCurveType === 'left' || prevEndCurveType === 'right') {
                if (rand < 0.7) { // Higher chance to continue current direction
                    this.curveType = prevEndCurveType;
                } else {
                    this.curveType = 'straight'; // Always transition through straight sections
                }
            }
        }

        // Gentler curve parameters
        const baseAmplitude = 80; // Reduced base amplitude for gentler curves
        const amplitudeVariation = 10; // Reduced variation for consistency
        let targetAmplitude = 0;

        if (this.curveType === 'left') {
            targetAmplitude = -(baseAmplitude + Math.random() * amplitudeVariation);
        } else if (this.curveType === 'right') {
            targetAmplitude = baseAmplitude + Math.random() * amplitudeVariation;
        }

        // Much smoother amplitude transition
        this.currentAmplitude = prevEndAmplitude || 0;
        const transitionRate = 0.15; // Significantly reduced for smoother changes
        
        // Generate points with enhanced smoothing
        const controlPoints = [];
        const numControlPoints = 5;
        
        // Generate control points for smoother curve
        for (let i = 0; i <= numControlPoints; i++) {
            const t = i / numControlPoints;
            const z = chunkStart + (t * this.size);
            
            // Gradual amplitude transition
            this.currentAmplitude += (targetAmplitude - this.currentAmplitude) * transitionRate;
            
            // Calculate smooth x position
            let x = startX;
            if (t > 0.1 && t < 0.9) {
                const curveT = this.smootherstep(0, 1, (t - 0.1) / 0.8);
                const mainCurve = Math.sin(Math.PI * curveT);
                x += this.currentAmplitude * mainCurve;
            }
            
            controlPoints.push(new THREE.Vector3(x, roadHeight, z));
        }
        
        // Generate final points using Catmull-Rom spline
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const z = chunkStart + (t * this.size);
            
            // Find relevant control points
            const segmentT = t * (numControlPoints);
            const index = Math.floor(segmentT);
            const localT = segmentT - index;
            
            // Get control points
            const p0 = controlPoints[Math.max(0, index - 1)];
            const p1 = controlPoints[Math.min(numControlPoints, index)];
            const p2 = controlPoints[Math.min(numControlPoints, index + 1)];
            const p3 = controlPoints[Math.min(numControlPoints, index + 2)];
            
            if (!p0 || !p1 || !p2 || !p3) continue;
            
            // Catmull-Rom spline calculation
            const t2 = localT * localT;
            const t3 = t2 * localT;
            
            const x = 0.5 * (
                (2 * p1.x) +
                (-p0.x + p2.x) * localT +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
            );

            const point = new THREE.Vector3(x, roadHeight, z);
            point.banking = 0;
            points.push(point);
        }

        return points;
    }

    
    smoothRoadPoints() {
        // Apply multiple passes of smoothing
        const smoothingPasses = 3;
        for (let pass = 0; pass < smoothingPasses; pass++) {
            // Skip first and last points to maintain chunk connections
            for (let i = 1; i < this.roadPoints.length - 1; i++) {
                const prev = this.roadPoints[i - 1];
                const curr = this.roadPoints[i];
                const next = this.roadPoints[i + 1];
                
                // Weighted average for smoother transitions
                curr.x = (prev.x + curr.x * 2 + next.x) / 4;
                curr.y = (prev.y + curr.y * 2 + next.y) / 4;
                curr.z = (prev.z + curr.z * 2 + next.z) / 4;
            }
        }
    }

    calculateBanking(t, prevDirection, currentX, startX) {
        // Enhanced banking calculation for smoother transitions
        let banking = 0;
        
        if (t > 0.04 && t < 0.96) {
            const dx = currentX - startX;
            const normalizedDx = dx / 100; // Scale factor for banking intensity
            banking = Math.atan(normalizedDx) * 0.3; // Reduced banking factor
            banking = Math.max(-0.3, Math.min(0.3, banking)); // Limit banking angle
        }
        
        // Smooth banking transition at chunk boundaries
        if (t <= 0.04) {
            const blendT = t / 0.04;
            const smoothT = this.smootherstep(0, 1, blendT);
            banking = banking * smoothT;
        } else if (t >= 0.96) {
            const blendT = (1 - t) / 0.04;
            const smoothT = this.smootherstep(0, 1, blendT);
            banking = banking * smoothT;
        }
        
        return banking;
    }


    generateRoad(scene) {
        if (!this.roadPoints || this.roadPoints.length < 2) return;

        // Validate all road points before processing
        const validRoadPoints = this.roadPoints.filter(p => 
            p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)
        );
        
        if (validRoadPoints.length < 2) {
            console.warn('Not enough valid road points to generate road');
            return;
        }

        const roadWidth = 24;
        const roadGeometry = new THREE.BufferGeometry();
        const positions = [];
        const uvs = [];
        const indices = [];
        const normals = [];

        // Significantly increase subdivisions for smoother edges
        const subdivisions = 48; // Doubled from 24 to 48 for smoother curves
        const smoothedPoints = [];
        
        // Generate smoothed points with enhanced catmull-rom spline
        for (let i = 0; i < this.roadPoints.length - 1; i++) {
            const p0 = i > 0 ? this.roadPoints[i - 1] : this.roadPoints[i];
            const p1 = this.roadPoints[i];
            const p2 = this.roadPoints[i + 1];
            const p3 = i < this.roadPoints.length - 2 ? this.roadPoints[i + 2] : p2;
            
            // Add extra control points for better curve shaping
            for (let j = 0; j <= subdivisions; j++) {
                const t = j / subdivisions;
                
                // Enhanced Catmull-Rom spline with tension parameter
                const t2 = t * t;
                const t3 = t2 * t;
                const tension = 0.5;
                
                // Calculate position with improved curve interpolation
                const point = new THREE.Vector3();
                
                // Hermite basis functions for smoother interpolation
                const h00 = 2*t3 - 3*t2 + 1;
                const h10 = t3 - 2*t2 + t;
                const h01 = -2*t3 + 3*t2;
                const h11 = t3 - t2;
                
                // Tangent vectors for better curve control
                const tangent1 = p2.clone().sub(p0).multiplyScalar(tension);
                const tangent2 = p3.clone().sub(p1).multiplyScalar(tension);
                
                // Apply hermite interpolation
                point.copy(p1.clone().multiplyScalar(h00))
                     .add(tangent1.multiplyScalar(h10))
                     .add(p2.clone().multiplyScalar(h01))
                     .add(tangent2.multiplyScalar(h11));
                
                // Keep constant height
                point.y = 50;
                
                // Remove banking
                point.banking = 0;
                smoothedPoints.push(point);
            }
        }

        // Calculate total road length for proper UV mapping
        let totalLength = 0;
        const segmentLengths = [];
        
        for (let i = 0; i < smoothedPoints.length - 1; i++) {
            const length = smoothedPoints[i].distanceTo(smoothedPoints[i + 1]);
            segmentLengths.push(length);
            totalLength += length;
        }

        let accumulatedLength = 0;
        
        // Generate road mesh with horizontal surface
        for (let i = 0; i < smoothedPoints.length - 1; i++) {
            const p1 = smoothedPoints[i];
            const p2 = smoothedPoints[i + 1];
            
            // Calculate road vectors with improved precision
            const forward = new THREE.Vector3().subVectors(p2, p1).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();

            // Calculate road edges without banking
            const halfWidth = roadWidth / 2;
            const widthVector = right.clone().multiplyScalar(halfWidth);
            
            const leftEdge1 = p1.clone().add(widthVector);
            const rightEdge1 = p1.clone().sub(widthVector);
            const leftEdge2 = p2.clone().add(widthVector);
            const rightEdge2 = p2.clone().sub(widthVector);

            // Add vertices with proper positioning
            const baseIndex = positions.length / 3;
            positions.push(
                leftEdge1.x, leftEdge1.y, leftEdge1.z,
                rightEdge1.x, rightEdge1.y, rightEdge1.z,
                leftEdge2.x, leftEdge2.y, leftEdge2.z,
                rightEdge2.x, rightEdge2.y, rightEdge2.z
            );

            // Calculate and add normals for better lighting
            const normal = up.clone();
            for (let j = 0; j < 4; j++) {
                normals.push(normal.x, normal.y, normal.z);
            }

            // Improved UV mapping for road geometry
            const segmentLength = segmentLengths[i];
            const v1 = accumulatedLength;
            const v2 = accumulatedLength + segmentLength;
            
            // UV coordinates for better texture alignment
            uvs.push(
                0, v1,     // Left edge
                1, v1,     // Right edge
                0, v2,     // Left edge next
                1, v2      // Right edge next
            );

            accumulatedLength += segmentLength;

            // Add faces with optimized triangulation
            indices.push(
                baseIndex, baseIndex + 1, baseIndex + 2,
                baseIndex + 2, baseIndex + 1, baseIndex + 3
            );
        }

        // Set geometry attributes
        roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        roadGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        roadGeometry.setIndex(indices);
        
        // Validate positions for NaN values
        const posArray = roadGeometry.attributes.position.array;
        for (let i = 0; i < posArray.length; i++) {
            if (isNaN(posArray[i])) {
                console.warn('Found NaN in road positions, skipping road mesh creation');
                return;
            }
        }
        
        // Compute additional attributes for better visual quality
        roadGeometry.computeVertexNormals();
        roadGeometry.computeTangents();

        // Load road textures with proper error handling
        const textureLoader = new THREE.TextureLoader();
        let roadDiffuseTexture = null;
        let roadNormalTexture = null;
        let roadRoughnessTexture = null;

        // Create fallback textures immediately
        const createFallbackTexture = (color) => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 256, 256);
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        };

        // Initialize with fallbacks
        roadDiffuseTexture = createFallbackTexture('#666666');
        roadNormalTexture = createFallbackTexture('#8080ff');
        roadRoughnessTexture = createFallbackTexture('#888888');

        // Try to load actual textures
        const tryLoadTexture = (url, callback) => {
            textureLoader.load(
                url,
                (texture) => {
                    console.log(`✅ Texture loaded: ${url}`);
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    callback(texture);
                },
                undefined,
                (error) => {
                    console.warn(`⚠️ Failed to load ${url}, using fallback`);
                }
            );
        };

        // Try loading from multiple paths
        const texturePaths = [
            '/road_diffuse.png',
            './road_diffuse.png',
            'road_diffuse.png'
        ];
        
        let diffuseLoaded = false;
        for (const path of texturePaths) {
            if (!diffuseLoaded) {
                tryLoadTexture(path, (texture) => {
                    roadDiffuseTexture = texture;
                    diffuseLoaded = true;
                });
            }
        }

        const normalPaths = [
            '/road_normal.png',
            './road_normal.png',
            'road_normal.png'
        ];
        
        let normalLoaded = false;
        for (const path of normalPaths) {
            if (!normalLoaded) {
                tryLoadTexture(path, (texture) => {
                    roadNormalTexture = texture;
                    normalLoaded = true;
                });
            }
        }

        const roughnessPaths = [
            '/road_roughness.png',
            './road_roughness.png',
            'road_roughness.png'
        ];
        
        let roughnessLoaded = false;
        for (const path of roughnessPaths) {
            if (!roughnessLoaded) {
                tryLoadTexture(path, (texture) => {
                    roadRoughnessTexture = texture;
                    roughnessLoaded = true;
                });
            }
        }

        // Configure texture settings for better detail and reflections
        const roadLength = totalLength;
        const repeatY = Math.ceil(roadLength / 15); // Tighter tiling for more detail
        
        if (roadDiffuseTexture && roadDiffuseTexture.image) {
            roadDiffuseTexture.repeat.set(1, repeatY);
            roadDiffuseTexture.wrapS = THREE.RepeatWrapping;
            roadDiffuseTexture.wrapT = THREE.RepeatWrapping;
            roadDiffuseTexture.anisotropy = 16;
            roadDiffuseTexture.minFilter = THREE.LinearMipmapLinearFilter;
            roadDiffuseTexture.magFilter = THREE.LinearFilter;
        }
        
        if (roadNormalTexture && roadNormalTexture.image) {
            roadNormalTexture.repeat.set(1, repeatY);
            roadNormalTexture.wrapS = THREE.RepeatWrapping;
            roadNormalTexture.wrapT = THREE.RepeatWrapping;
        }
        
        if (roadRoughnessTexture && roadRoughnessTexture.image) {
            roadRoughnessTexture.repeat.set(1, repeatY);
            roadRoughnessTexture.wrapS = THREE.RepeatWrapping;
            roadRoughnessTexture.wrapT = THREE.RepeatWrapping;
        }

        // Create enhanced road material - Rough asphalt look
        const roadMaterialOptions = {
            roughness: 0.95,   // Very high roughness for worn asphalt texture
            metalness: 0.0,    // Removed metalness for non-reflective look
            envMapIntensity: 0.15,  // Very minimal reflections
            side: THREE.DoubleSide,
            normalScale: new THREE.Vector2(2.0, 2.0)  // Increased for visible bumpy texture
        };

        // Add textures only if they have image data (successfully loaded)
        if (roadDiffuseTexture && roadDiffuseTexture.image && roadDiffuseTexture.image.width > 0) {
            roadMaterialOptions.map = roadDiffuseTexture;
            console.log('✅ Applying diffuse texture to road');
        } else {
            console.warn('⚠️ Diffuse texture not available, using fallback');
        }
        
        if (roadNormalTexture && roadNormalTexture.image && roadNormalTexture.image.width > 0) {
            roadMaterialOptions.normalMap = roadNormalTexture;
            console.log('✅ Applying normal map to road');
        } else {
            console.warn('⚠️ Normal texture not available, using fallback');
        }
        
        if (roadRoughnessTexture && roadRoughnessTexture.image && roadRoughnessTexture.image.width > 0) {
            roadMaterialOptions.roughnessMap = roadRoughnessTexture;
            console.log('✅ Applying roughness map to road');
        } else {
            console.warn('⚠️ Roughness texture not available, using fallback');
        }

        const roadMaterial = new THREE.MeshStandardMaterial(roadMaterialOptions);

        this.roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
        this.roadMesh.receiveShadow = true;
        this.roadMesh.castShadow = true;
        this.roadMesh.renderOrder = 1;

        scene.add(this.roadMesh);

        // Generate road lines
        this.roadLines = createRoadLines(this.roadPoints);

        scene.add(this.roadLines);
    }

    findNearestRoadPoint(x, z) {
        if (!this.roadPoints || this.roadPoints.length === 0) return null;
        
        let nearest = null;
        let minDist = Infinity;
        
        for (const point of this.roadPoints) {
            const dist = new THREE.Vector2(x - point.x, z - point.z).length();
            if (dist < minDist) {
                minDist = dist;
                nearest = point;
            }
        }
        
        return nearest;
    }

    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.roadMesh) {
            scene.remove(this.roadMesh);
            this.roadMesh.geometry.dispose();
            this.roadMesh.material.dispose();
        }
        if (this.roadLines) {
            scene.remove(this.roadLines);
            this.roadLines.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
    }
}

class RoadChunkManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.chunks = new Map();
        this.chunkSize = 500;
        this.renderDistance = 2;
        this.lastChunk = null;
        this.staticLastPoint = null;
        this.staticDirection = null;
        this.staticEndZ = null;
        this.staticTerrainHeightFunc = null;
        this.chunkPool = [];
        this.maxPoolSize = 4;
        this.isGenerating = false;
        this.generationQueue = [];
        this.currentGenerationStep = null;
        this.framesBetweenGeneration = 2;
        this.frameCounter = 0;
        this.maxGenerationTimePerFrame = 8;
        this.lastGenerationTime = 0;
        this.roadWidth = 24;
        this.roadMaterial = null;
        this.currentChunkCoords = { x: 0, z: 0 };
        this.lastChunkCoords = { x: 0, z: 0 };
        this.textureCache = null;
    }

    initializeFromStaticRoad(lastPoint, secondLastPoint) {
        this.staticLastPoint = lastPoint.clone();
        this.staticDirection = new THREE.Vector3()
            .subVectors(lastPoint, secondLastPoint)
            .normalize();
        this.staticEndZ = lastPoint.z;
    }

    setStaticTerrainHeightFunction(func) {
        this.staticTerrainHeightFunc = func;
    }

    getChunkKey(position) {
        const relativeZ = position.z - this.staticEndZ;
        const chunkZ = Math.floor(relativeZ / this.chunkSize);
        return chunkZ;
    }

    getChunkFromPool(position) {
        let chunk;
        if (this.chunkPool.length > 0) {
            chunk = this.chunkPool.pop();
            chunk.position.copy(position);
            // Reset chunk properties
            chunk.mesh = null;
            chunk.roadMesh = null;
            chunk.roadLines = null;
            chunk.roadPoints = [];
            chunk.boundaryHeights.clear();
            chunk.curveParameters = null;
            chunk.previousChunk = null;
            chunk.nextChunk = null;
        } else {
            chunk = new RoadChunk(position, this.chunkSize);
        }
        return chunk;
    }

    addChunkToPool(chunk) {
        if (this.chunkPool.length < this.maxPoolSize) {
            chunk.dispose(this.scene);
            this.chunkPool.push(chunk);
        } else {
            chunk.dispose(this.scene);
        }
    }

    update(playerPosition) {
        const currentTime = performance.now();
        const timeSinceLastGeneration = currentTime - this.lastGenerationTime;
        
        // Only process generation if enough time has passed
        if (timeSinceLastGeneration < 16) { // Aim for 60fps (16ms per frame)
            return;
        }

        const currentChunkKey = this.getChunkKey(playerPosition);
        
        // Queue initial chunk if needed
        if (this.chunks.size === 0) {
            this.queueChunkGeneration(0);
        }

        // Queue next chunk if needed, but limit the number of queued chunks
        const maxGeneratedKey = Math.max(...Array.from(this.chunks.keys(), k => k || 0));
        if (maxGeneratedKey < currentChunkKey + 1 && this.generationQueue.length < 2) {
            this.queueChunkGeneration(maxGeneratedKey + 1);
        }

        // Process generation queue with frame limiting
        this.frameCounter++;
        if (this.frameCounter >= this.framesBetweenGeneration) {
            this.frameCounter = 0;
        this.processGenerationQueue();
        }

        // Clean up old chunks progressively
        let cleanupCount = 0;
        for (const [key, chunk] of this.chunks) {
            if (key < currentChunkKey - 1) {
                this.addChunkToPool(chunk);
                this.chunks.delete(key);
                cleanupCount++;
                
                // Limit cleanup per frame
                if (cleanupCount >= 1) break;
            }
        }

        this.lastGenerationTime = currentTime;
    }

    queueChunkGeneration(key) {
        if (!this.chunks.has(key) && !this.generationQueue.includes(key)) {
            this.generationQueue.push(key);
        }
    }

    processGenerationQueue() {
        // If we're already generating or queue is empty, do nothing
        if (this.isGenerating || this.generationQueue.length === 0) return;

        // Start generating the next chunk
        const key = this.generationQueue[0];
        this.startChunkGeneration(key);
    }

    startChunkGeneration(key) {
        if (this.isGenerating) return;
        
        // Calculate chunk position based on key
        const chunkPosition = new THREE.Vector3(
            0,
            0,
            this.staticEndZ + (key * this.chunkSize + this.chunkSize / 2)
        );
        
        const chunk = this.getChunkFromPool(chunkPosition);
        const prevChunkKey = key - 1;
        const previousChunk = this.chunks.get(prevChunkKey);
        
        if (key === 0 && this.staticLastPoint) {
            chunk.initializeFromStaticRoad(this.staticLastPoint, this.staticDirection);
            chunk.staticTerrainHeightFunc = this.staticTerrainHeightFunc;
        }

        this.isGenerating = true;
        this.currentGenerationStep = {
            chunk,
            key,
            previousChunk,
            step: 0,
            totalSteps: 8,
            batchProgress: 0,
            vertexBatchSize: 1000,
            texturesLoaded: false
        };

        // Ensure textures are loaded before starting generation
        this.preloadTextures().then(() => {
            requestAnimationFrame(() => this.continueGeneration());
        });
    }

    preloadTextures() {
        if (this.textureCache) return Promise.resolve();
        
        this.textureCache = {
            grass: null,
            road: null,
            roadNormal: null,
            roadRoughness: null
        };

        const textureLoader = new THREE.TextureLoader();
        
        // Load all textures asynchronously
        const loadTexture = (url, key, options = {}) => {
            return new Promise((resolve) => {
                textureLoader.load(
                    url,
                    (texture) => {
                        Object.assign(texture, options);
                        this.textureCache[key] = texture;
                        resolve();
                    },
                    undefined,
                    () => {
                        // Graceful fallback: use a 1x1 white texture if missing
                        const fallback = new THREE.Texture(
                            new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)
                        );
                        Object.assign(fallback, options);
                        fallback.needsUpdate = true;
                        this.textureCache[key] = fallback;
                        resolve();
                    }
                );
            });
        };

        return Promise.all([
            loadTexture('/grass.jpg', 'grass', {
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                repeat: new THREE.Vector2(60, 60),
                anisotropy: this.renderer ? this.renderer.capabilities.getMaxAnisotropy() : 1
            }),
            loadTexture('/road_diffuse.png', 'road', {
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                repeat: new THREE.Vector2(1, 1),
                anisotropy: 16
            }),
            loadTexture('/road_normal.png', 'roadNormal', {
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                repeat: new THREE.Vector2(1, 1)
            }),
            loadTexture('/road_roughness.png', 'roadRoughness', {
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                repeat: new THREE.Vector2(1, 1)
            })
        ]).then(() => {
            if (this.currentGenerationStep) {
                this.currentGenerationStep.texturesLoaded = true;
            }
        });
    }

    continueGeneration() {
        if (!this.currentGenerationStep) return;

        const startTime = performance.now();
        const { chunk, key, previousChunk, step } = this.currentGenerationStep;
        const { vertexBatchSize } = this.currentGenerationStep;

        try {
            switch (step) {
                case 0: // Generate road points
                    chunk.roadPoints = chunk.generateRoadPoints(previousChunk);
                    break;

                case 1: // Create terrain geometry with reduced resolution
                    chunk.terrainGeometry = new THREE.PlaneGeometry(chunk.size, chunk.size, 32, 32);
                    chunk.terrainGeometry.rotateX(-Math.PI / 2);
                    chunk.terrainGeometry.attributes.position.needsUpdate = true;
                    break;

                case 2: // Process terrain vertices in optimized batches
                    const vertices = chunk.terrainGeometry.attributes.position;
                    const startIdx = this.currentGenerationStep.batchProgress || 0;
                    const maxVertsPerFrame = 500;
                    const endIdx = Math.min(startIdx + maxVertsPerFrame, vertices.count);

                    // Pre-calculate heights for the batch
                    const heights = new Float32Array(endIdx - startIdx);
                    for (let i = startIdx; i < endIdx; i++) {
                        const x = vertices.getX(i) + chunk.position.x;
                        const z = vertices.getZ(i) + chunk.position.z;
                        heights[i - startIdx] = chunk.calculateTerrainHeight(x, z, false);
                    }

                    // Apply heights in a single pass
                    for (let i = startIdx; i < endIdx; i++) {
                        vertices.setY(i, heights[i - startIdx]);
                    }

                    vertices.needsUpdate = true;
                    this.currentGenerationStep.batchProgress = endIdx;

                    if (endIdx < vertices.count) {
                        if (performance.now() - startTime < this.maxGenerationTimePerFrame) {
                            this.continueGeneration();
                        } else {
                            requestAnimationFrame(() => this.continueGeneration());
                        }
                        return;
                    }
                    
                    chunk.terrainGeometry.computeVertexNormals();
                    break;

                case 3: // Create terrain mesh with final material immediately
                    if (this.textureCache && this.textureCache.grass) {
                        const groundMaterial = new THREE.MeshStandardMaterial({
                            map: this.textureCache.grass,
                            side: THREE.FrontSide,
                            roughness: 0.9,
                            metalness: 0.1,
                            flatShading: false
                        });
                        chunk.mesh = new THREE.Mesh(chunk.terrainGeometry, groundMaterial);
                        chunk.mesh.position.copy(chunk.position);
                        chunk.mesh.receiveShadow = true;
                        chunk.mesh.frustumCulled = true;
                        this.scene.add(chunk.mesh);
                    }
                    break;

                case 4: // Skip material update since we applied it in step 3
                    break;

                case 5: // Generate road with simplified initial geometry
                    if (!chunk.roadPoints || chunk.roadPoints.length < 2) break;
                    chunk.generateRoad(this.scene);
                    break;

                case 6: // Finalize chunk
                    this.finalizeChunkGeneration(chunk, key);
                    break;
            }

            // Check if we have time for the next step
            if (performance.now() - startTime < this.maxGenerationTimePerFrame) {
                this.currentGenerationStep.step++;
                if (this.currentGenerationStep.step < 7) {
                    this.continueGeneration();
                } else {
                    this.completeGeneration();
                }
            } else {
                // Schedule next step for next frame
                this.currentGenerationStep.step++;
                if (this.currentGenerationStep.step < 7) {
                    requestAnimationFrame(() => this.continueGeneration());
                } else {
                    this.completeGeneration();
                }
            }
        } catch (error) {
            console.error('Error in chunk generation:', error);
            this.completeGeneration();
        }
    }

    completeGeneration() {
        this.isGenerating = false;
        this.generationQueue.shift();
        this.currentGenerationStep = null;
        
        if (this.generationQueue.length > 0) {
            setTimeout(() => this.processGenerationQueue(), 32);
        }
    }

    finalizeChunkGeneration(chunk, key) {
        // Only add meshes that haven't been added yet
        if (chunk.mesh && !chunk.mesh.parent) {
            this.scene.add(chunk.mesh);
            }
        if (chunk.roadMesh && !chunk.roadMesh.parent) {
            this.scene.add(chunk.roadMesh);
        }
        if (chunk.roadLines && !chunk.roadLines.parent) {
            this.scene.add(chunk.roadLines);
        }
        
        this.chunks.set(key, chunk);
        this.lastChunk = chunk;
    }

    getHeightAt(x, z) {
        // If we're in static terrain area
        if (this.staticTerrainHeightFunc) {
            const transitionZone = 100;
            
        if (z <= this.staticEndZ) {
                return this.staticTerrainHeightFunc(x, z);
            }
            
            if (z <= this.staticEndZ + transitionZone) {
                const staticHeight = this.staticTerrainHeightFunc(x, this.staticEndZ);
                
                // Find the appropriate chunk for auto terrain height
                const chunkKey = this.getChunkKey(new THREE.Vector3(x, 0, z));
                const chunk = this.chunks.get(chunkKey);
                let autoHeight = 0;
                
                if (chunk) {
                    autoHeight = chunk.calculateTerrainHeight(x, z);
                } else if (this.lastChunk) {
                    autoHeight = this.lastChunk.calculateTerrainHeight(x, z);
                }
                
                // Use the same smooth transition
                const t = (z - this.staticEndZ) / transitionZone;
                const smoothStep = t * t * (3 - 2 * t);
                
                // Sample multiple points for better height matching
                const samplePoints = 5;
                let avgStaticHeight = 0;
                let avgAutoHeight = 0;
                
                for (let i = 0; i < samplePoints; i++) {
                    const sampleX = x - 200 + (i * 100);
                    avgStaticHeight += this.staticTerrainHeightFunc(sampleX, this.staticEndZ);
                    
                    if (chunk) {
                        avgAutoHeight += chunk.calculateTerrainHeight(sampleX, z);
                    } else if (this.lastChunk) {
                        avgAutoHeight += this.lastChunk.calculateTerrainHeight(sampleX, z);
                    }
                }
                
                avgStaticHeight /= samplePoints;
                avgAutoHeight /= samplePoints;
                
                const heightDiff = avgStaticHeight - avgAutoHeight;
                const heightAdjustment = heightDiff * (1 - smoothStep);
                
                return autoHeight + heightAdjustment;
            }
        }

        // For auto-generated terrain, find the appropriate chunk
        const chunkKey = this.getChunkKey(new THREE.Vector3(x, 0, z));
        const chunk = this.chunks.get(chunkKey);
        
        if (!chunk) {
            // If we're near the static terrain boundary
            if (chunkKey === 0 && this.staticTerrainHeightFunc) {
                const transitionDistance = 50; // Transition zone width
                const distanceFromStatic = z - this.staticEndZ;
                
                if (distanceFromStatic < transitionDistance) {
                    const staticHeight = this.staticTerrainHeightFunc(x, this.staticEndZ);
                    const autoHeight = this.lastChunk ? this.lastChunk.calculateTerrainHeight(x, z) : 0;
                    const blend = distanceFromStatic / transitionDistance;
                    return THREE.MathUtils.lerp(staticHeight, autoHeight, blend);
                }
            }
            
            // Handle height for chunks beyond the last generated chunk
            const lastChunkKey = Math.max(...Array.from(this.chunks.keys()));
            const lastChunk = this.chunks.get(lastChunkKey);
            
            if (lastChunk) {
                const distanceFromLastChunk = z - (this.staticEndZ + (lastChunkKey + 1) * this.chunkSize);
                const transitionDistance = 500;
                
                if (distanceFromLastChunk < transitionDistance) {
                    const height = lastChunk.calculateTerrainHeight(x, z);
                    const t = Math.max(0, Math.min(1, distanceFromLastChunk / transitionDistance));
                    return height * (1 - t);
                }
            }
            return 0;
        }

        return chunk.calculateTerrainHeight(x, z);
    }

    createRoadMesh(geometry) {
        const mesh = new THREE.Mesh(geometry, this.roadMaterial);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        return mesh;
    }
}

// Initialize scene objects
let dynamicCloudSystem = null;
let lastCloudUpdatePosition = new THREE.Vector3();
let cloudGroups = [];
let cloudSystem = null;
let cloudTexture1 = null;
let cloudTexture2 = null;
let lastTimestamp = null;

// Initialize loaders with separate managers to avoid cross-logging
const textureLoadingManager = new THREE.LoadingManager();
textureLoadingManager.onError = (url) => {
    console.error('Error loading texture:', url);
};
const textureLoader = new THREE.TextureLoader(textureLoadingManager);

const gltfLoadingManager = new THREE.LoadingManager();
gltfLoadingManager.onError = (url) => {
    console.error('Error loading model:', url);
};
const gltfLoader = new GLTFLoader(gltfLoadingManager);

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000); // Increased far plane to see clouds
camera.position.set(0, 100, 300);

// Initialize renderer with context loss handling
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
    alpha: true        // Enable alpha for proper transparency
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4; // Increased exposure for brighter scene
renderer.setClearColor(0x000000, 0); // Set clear color with 0 alpha
document.getElementById('game-container').appendChild(renderer.domElement);

// Add atmospheric lighting for purple/pink sunset - increased intensities for brighter scene
const ambientLight = new THREE.AmbientLight(0xff69b4, 1.6); // Hot pink ambient light - increased from 1.2
scene.add(ambientLight);

// Hemisphere light for gradient sky effect (purple top, pink bottom)
const hemisphereLight = new THREE.HemisphereLight(0xc739e8, 0xff1493, 1.8); // Brighter purple sky, hot pink ground - increased from 1.2
scene.add(hemisphereLight);

// Soft directional light from horizon for depth
const directionalLight = new THREE.DirectionalLight(0xff1493, 1.2); // Hot pink directional - increased from 0.8
directionalLight.position.set(0, 20, 100); // From horizon
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

// Additional warm glow for atmosphere
const warmAmbientLight = new THREE.AmbientLight(0xff00ff, 1.0); // Magenta glow - increased from 0.7
scene.add(warmAmbientLight);

// Create an always-present gradient sky dome that follows the camera
function createSkyDome() {
    const geometry = new THREE.SphereGeometry(10000, 32, 32);
    geometry.scale(-1, 1, 1); // Invert the sphere so we see the inside
    const skyShader = {
        uniforms: {
            topColor: { value: new THREE.Color(0x894fe2) },      // Vibrant purple at top
            middleColor: { value: new THREE.Color(0xff1493) },   // Hot pink/magenta in middle
            horizonColor: { value: new THREE.Color(0xff6b35) },  // Bright orange-red at horizon
            offset: { value: 33 },
            exponent: { value: 0.5 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 middleColor;
            uniform vec3 horizonColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
                
                // Create prominent orange gradient at horizon, blending to pink then purple
                vec3 color;
                
                // Strong orange band at the very bottom (0 to 0.25)
                if (h < 0.25) {
                    float t = h / 0.25;
                    // Keep orange strong for most of this range, then blend to orange-pink
                    t = smoothstep(0.0, 1.0, t);
                    vec3 orangePink = mix(horizonColor, middleColor, 0.3);
                    color = mix(horizonColor, orangePink, t);
                }
                // Smooth transition from orange-pink to pink (0.25 to 0.45)
                else if (h < 0.45) {
                    float t = (h - 0.25) / 0.2;
                    t = smoothstep(0.0, 1.0, t);
                    vec3 orangePink = mix(horizonColor, middleColor, 0.3);
                    color = mix(orangePink, middleColor, t);
                }
                // Blend from pink to purple at top (0.45 to 1.0)
                else {
                    float t = (h - 0.45) / 0.55;
                    t = pow(t, exponent);
                    color = mix(middleColor, topColor, t);
                }
                
                gl_FragColor = vec4(color, 1.0);
            }
        `
    };
    const material = new THREE.ShaderMaterial({
        uniforms: skyShader.uniforms,
        vertexShader: skyShader.vertexShader,
        fragmentShader: skyShader.fragmentShader,
        side: THREE.BackSide,
        depthWrite: false
    });
    skyDome = new THREE.Mesh(geometry, material);
    skyDome.frustumCulled = false;
    scene.add(skyDome);
}

// No sun mesh - using atmospheric lighting only for diffuse sunset glow

// Initialize road chunk manager
const roadChunkManager = new RoadChunkManager(scene, renderer);

// Add context loss handling
const canvas = renderer.domElement;
canvas.addEventListener('webglcontextlost', handleContextLost, false);
canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

// Handle WebGL context loss
function handleContextLost(event) {
    event.preventDefault();
    console.log('WebGL context lost. Stopping animation...');
    cancelAnimationFrame(animate);
}

// Handle WebGL context restoration
function handleContextRestored() {
    console.log('WebGL context restored. Reinitializing...');
    
    // Reinitialize renderer settings
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.setClearColor(0x000000, 0);

    // Reinitialize textures and cloud system
    loadTextures().then(async () => {
        // Reinitialize cloud system
        const success = await cloudManager.initialize(scene, camera, new THREE.Vector3(0, 0, 0), roadChunkManager.chunkSize);
        if (!success) {
            console.error('Failed to reinitialize cloud system');
        }
    }).catch(error => {
        console.error('Error reinitializing cloud system:', error);
    });

    // Restart animation loop
    animate();
}

// Initialize post-processing
const composer = new EffectComposer(renderer);

// Custom motion blur shader
const motionBlurShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "velocity": { value: new THREE.Vector2(0, 0) },
        "strength": { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 velocity;
        uniform float strength;
        varying vec2 vUv;

        // Gaussian weight function for better quality blur
        float gaussian(float x, float sigma) {
            return exp(-(x * x) / (2.0 * sigma * sigma));
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            
            // Early exit if no motion
            if (length(velocity) < 0.000001) {
                gl_FragColor = color;
                return;
            }

            vec4 sum = color;
            float totalWeight = 1.0;
            
            const int numSamples = 24; // Increased samples for better quality
            float sigma = 0.5; // Gaussian blur parameter
            
            // Normalized velocity vector
            vec2 normalizedVelocity = normalize(velocity);
            float velocityLength = length(velocity) * strength;
            
            for (int i = 1; i <= numSamples; i++) {
                float t = float(i) / float(numSamples);
                
                // Use exponential step size for better sampling at high speeds
                float stepSize = exp(t * 0.7) - 1.0;
                
                // Calculate offset with exponential distribution
                vec2 offset = normalizedVelocity * stepSize * velocityLength;
                
                // Calculate weight based on distance and gaussian function
                float weight = gaussian(stepSize, sigma) * (1.0 - t * 0.5);
                
                // Sample in both directions
                vec4 forward = texture2D(tDiffuse, vUv + offset);
                vec4 backward = texture2D(tDiffuse, vUv - offset);
                
                // Add weighted samples
                sum += (forward + backward) * weight;
                totalWeight += 2.0 * weight;
            }
            
            // Normalize and apply slight contrast enhancement
            vec4 blurred = sum / totalWeight;
            gl_FragColor = mix(color, blurred, smoothstep(0.0, 1.0, length(velocity)));
        }
    `
};

// Add render pass
const renderPass = new RenderPass(scene, camera);
renderPass.clearColor = new THREE.Color(0x000000);
renderPass.clearAlpha = 0;
composer.addPass(renderPass);

// Configure motion blur
const motionBlurPass = new ShaderPass(motionBlurShader);
motionBlurPass.renderToScreen = false;
motionBlurPass.uniforms.velocity.value.set(0, 0);
motionBlurPass.uniforms.strength.value = 1.0;
composer.addPass(motionBlurPass);

// Add velocity smoothing with better parameters
const velocitySmoothing = {
    current: new THREE.Vector2(0, 0),
    target: new THREE.Vector2(0, 0),
    smoothFactor: 0.2, // Balanced smoothing
    velocityScale: 0.008, // Fine-tuned scale factor
    strengthScale: 0.004, // Fine-tuned strength scaling
    maxStrength: 1.5 // Capped maximum strength
};

// Configure bloom effect with sunset-optimized parameters
const bloomParams = {
    threshold: 0.75,    // Higher threshold to reduce bloom spread
    strength: 0.35,     // Further reduced strength for subtler glow
    radius: 0.5,        // Reduced radius for tighter glow
};

// Add bloom pass
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomParams.strength,
    bloomParams.radius,
    bloomParams.threshold
);
composer.addPass(bloomPass);

// Add color grading pass
const colorGradingShader = {
    uniforms: {
        tDiffuse: { value: null },
        brightness: { value: 1.05 },  // Reduced brightness
        contrast: { value: 1.1 },     // Slightly reduced contrast
        saturation: { value: 1.15 },  // Reduced saturation
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        varying vec2 vUv;
        
        vec3 adjustSaturation(vec3 color, float adjustment) {
            vec3 intensity = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
            return mix(intensity, color, adjustment);
        }
        
        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            vec3 color = tex.rgb;
            
            // Apply brightness
            color *= brightness;
            
            // Apply contrast with preserved midtones
            float midpoint = 0.5;
            color = (color - midpoint) * contrast + midpoint;
            
            // Apply saturation
            color = adjustSaturation(color, saturation);
            
            // Add slight warmth to highlights (reduced effect)
            float luminance = dot(color, vec3(0.299, 0.587, 0.114));
            vec3 warmth = vec3(1.0, 0.95, 0.9);  // More subtle warm tint
            color = mix(color, color * warmth, luminance * 0.1);  // Reduced warmth intensity
            
            gl_FragColor = vec4(color, tex.a);
        }
    `
};

const colorGradingPass = new ShaderPass(colorGradingShader);
colorGradingPass.renderToScreen = true;
composer.addPass(colorGradingPass);

// Make sure the last pass renders to screen
colorGradingPass.renderToScreen = true;

// Initialize camera mode
let cameraMode = 'follow'; // Can be 'follow' or 'orbit'

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.enabled = cameraMode === 'orbit';

// Initialize everything and start animation loop
Promise.all([
    loadCarModel() // Now returns a promise
]).then(async () => {
    console.log('Car model loaded, initializing scene elements...');
    
    // Using atmospheric lighting only - no sun mesh needed
    
    // Initialize cloud system
    const initialPosition = new THREE.Vector3(0, 0, 0);
    console.log('Creating initial clouds at position:', initialPosition);
    const cloudInitialized = await cloudManager.initialize(scene, camera, initialPosition, roadChunkManager.chunkSize);
    if (!cloudInitialized) {
        console.error('Failed to initialize cloud system');
    }
    
    console.log('Starting animation loop with car model');
    
    // Start the animation loop only if car is loaded
    if (car && carModel) {
        console.log('Starting animation loop with car model');
        animate();
    } else {
        console.error('Failed to load car model, animation not started');
    }
}).catch(error => {
    console.error('Error during initialization:', error);
});

// Sky dome gradient shader with fixed depth and improved gradient

// Sky dome gradient shader with fixed depth and improved gradient
const skyVertexShader = `
    varying vec3 vWorldPosition;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // Force maximum depth
    }
`;

const skyFragmentShader = `
    varying vec3 vWorldPosition;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    
    void main() {
        float h = normalize(vWorldPosition).y;
        float t = clamp((h + offset) * exponent, 0.0, 1.0);
        vec3 color = mix(bottomColor, topColor, t);
        gl_FragColor = vec4(color, 1.0);
    }
`;

// Create sky material with uniforms for better control
const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x894fe2) },    // Vibrant purple
        bottomColor: { value: new THREE.Color(0xff1493) },  // Hot pink/magenta horizon
        offset: { value: 0.2 },
        exponent: { value: 0.9 }
    },
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false
});

// Create larger sky dome with more segments
const skyGeometry = new THREE.SphereGeometry(20000, 60, 60);
const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
skyDome.renderOrder = -2; // Ensure it renders before everything
skyDome.frustumCulled = false; // Prevent culling
scene.add(skyDome);

// Update renderer settings for proper transparency
renderer.setClearColor(0x000000, 0);
renderer.autoClear = true;
renderer.sortObjects = true;

// Update composer settings
composer.renderToScreen = true;

// Update render pass settings
renderPass.clear = true;
renderPass.clearDepth = true;
renderPass.clearColor = true;

// Update window resize handler
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
}

window.addEventListener('resize', onWindowResize);

// Initialize animation timestamp
let animationTimestamp = null;  // Initialize outside but don't set a value

// Initialize animation
function animate(timestamp) {
    requestAnimationFrame(animate);

    // Atmospheric lighting - no sun mesh to update

    // Ensure we have a valid timestamp
    timestamp = timestamp || performance.now();
    
    // Calculate delta time (first frame will have 0 delta)
    const deltaTime = Math.min(0.05, (timestamp - (animate.lastTime || timestamp)) / 1000);
    animate.lastTime = timestamp;

    // Update motion blur based on car velocity with improved smoothing
    if (car && carState && carState.position) {
        if (animate.lastCarPosition) {
            const velocity = new THREE.Vector3()
                .copy(carState.position)
                .sub(animate.lastCarPosition)
                .multiplyScalar(1 / deltaTime);
            
            // Calculate base velocity with speed-dependent scaling
            const speed = velocity.length();
            const speedFactor = Math.min(1.0, speed / 100); // Normalize speed relative to 100 units/sec
            const adaptiveScale = velocitySmoothing.velocityScale * (1.0 + speedFactor);
            
            // Convert world space velocity to screen space with adaptive scaling
            velocitySmoothing.target.set(
                velocity.x * adaptiveScale,
                velocity.z * adaptiveScale
            );
            
            // Apply smoothing to velocity with dynamic smoothing factor
            const dynamicSmoothFactor = velocitySmoothing.smoothFactor * (1.0 + speedFactor * 0.5);
            velocitySmoothing.current.lerp(velocitySmoothing.target, dynamicSmoothFactor);
            
            // Calculate strength with non-linear scaling
            const currentSpeed = velocitySmoothing.current.length();
            const targetStrength = Math.min(
                velocitySmoothing.maxStrength,
                Math.pow(currentSpeed * velocitySmoothing.strengthScale, 1.2)
            );
            
            // Update shader uniforms
            motionBlurPass.uniforms.velocity.value.copy(velocitySmoothing.current);
            motionBlurPass.uniforms.strength.value = targetStrength;
        }
        animate.lastCarPosition = carState.position.clone();
    }

    // Update chunks based on car position
    if (car && carState && carState.position) {
        roadChunkManager.update(carState.position);
        cloudManager.update(carState.position, timestamp);
        // Keep sky dome centered on camera so it never ends
        if (skyDome) {
            skyDome.position.copy(camera.position);
        }
    }

    // Update car physics
    updateCarPhysics(deltaTime);
    
    // Update bloom parameters
    bloomPass.threshold = bloomParams.threshold;
    bloomPass.strength = bloomParams.strength;
    bloomPass.radius = bloomParams.radius;

    // Render the scene
    composer.render();
}

// Initialize key state object
const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    Space: false
};

// Update key event listeners
document.addEventListener('keydown', (event) => {
    if (event.code in keys) {
        keys[event.code] = true;
        event.preventDefault(); // Prevent default browser behavior
    }
    if (event.code === 'KeyC') {
        cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
        if (cameraMode === 'orbit') {
            controls.enabled = true;
            camera.position.set(0, 100, 300);
            controls.target.copy(carState.position);
        } else {
            controls.enabled = false;
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code in keys) {
        keys[event.code] = false;
        event.preventDefault(); // Prevent default browser behavior
    }
});

// Update car physics
function updateCarPhysics(deltaTime) {
    // Skip physics update if car model is not loaded
    if (!car || !carModel || !carModel.position || !carModel.rotation) {
        console.warn('Car model not fully initialized, skipping physics update');
        return;
    }

    // Enhanced acceleration with smooth curve
    const accelerationMultiplier = Math.pow(1 - (Math.abs(carState.speed) / CAR_CONFIG.maxSpeed), 0.5);
    
    if (keys.KeyW) {
        const accelerationForce = CAR_CONFIG.acceleration * accelerationMultiplier;
        carState.speed += accelerationForce * deltaTime;
    } else if (keys.KeyS) {
        const brakeMultiplier = carState.speed > 0 ? 1 : 0.5; // Softer braking in reverse
        carState.speed -= CAR_CONFIG.brakeForce * brakeMultiplier * deltaTime;
    } else {
        // Progressive deceleration based on speed
        const decelerationForce = CAR_CONFIG.deceleration * (1 + Math.abs(carState.speed) / 50);
        if (Math.abs(carState.speed) > 0.1) {
            carState.speed *= (1 - decelerationForce * deltaTime);
        } else {
            carState.speed = 0;
        }
    }

    // Clamp speed with smooth transition
    carState.speed = Math.max(
        -CAR_CONFIG.reverseSpeed,
        Math.min(carState.speed, CAR_CONFIG.maxSpeed)
    );

    // Enhanced steering logic with speed-based adjustment
    const speedFactor = Math.abs(carState.speed);
    const normalizedSpeed = Math.min(speedFactor / 50, 1); // Normalize speed for steering calculation
    const dynamicTurnSpeed = THREE.MathUtils.lerp(
        CAR_CONFIG.minSteeringSpeed,
        CAR_CONFIG.steeringSpeed,
        normalizedSpeed * CAR_CONFIG.speedSteeringFactor
    );

    if (keys.KeyA) {
        // Gradual steering buildup
        carState.steering = THREE.MathUtils.lerp(
            carState.steering,
            dynamicTurnSpeed,
            0.15
        );
    } else if (keys.KeyD) {
        carState.steering = THREE.MathUtils.lerp(
            carState.steering,
            -dynamicTurnSpeed,
            0.15
        );
    } else {
        // Smooth steering return with speed-based adjustment
        const returnSpeed = 0.08 * (1 + normalizedSpeed * 0.5);
        carState.steering *= (1 - returnSpeed);
    }

    // Calculate movement direction with enhanced smoothing
    const moveAngle = carState.rotation.y;
    const moveDir = new THREE.Vector3(
        Math.sin(moveAngle),
        0,
        Math.cos(moveAngle)
    );

    // Update position with ground friction
    const movement = moveDir.multiplyScalar(carState.speed * deltaTime * CAR_CONFIG.groundFriction);
    carState.position.add(movement);

    // Enhanced rotation calculation with speed-dependent turning
    if (Math.abs(carState.speed) > 0.1) {
        // Progressive turning based on speed
        const turnSpeedFactor = Math.pow(Math.abs(carState.speed) / CAR_CONFIG.maxSpeed, 0.6);
        const turnAmount = carState.steering * deltaTime * turnSpeedFactor;
        
        // Apply turn amount with direction compensation
        if (carState.speed > 0) {
            carState.rotation.y += turnAmount;
        } else {
            carState.rotation.y -= turnAmount;
        }
    }

    // Keep car on the ground
    if (car) {
        // Get ground height at car's position using roadChunkManager
        const groundHeight = roadChunkManager.getHeightAt(carState.position.x, carState.position.z);
        
        // Update car position with proper ground height
        car.position.copy(carState.position);
        car.position.y = groundHeight + CAR_CONFIG.groundClearance;
        car.rotation.y = carState.rotation.y;
        
        // Add extremely subtle body roll effect
        const targetRoll = carState.steering * CAR_CONFIG.bodyRollFactor;
        carRoll = THREE.MathUtils.lerp(carRoll, targetRoll, 0.03);
        car.rotation.z = carRoll;

        // Update car state position to match
        carState.position.y = car.position.y;
    }

    // Update camera in follow mode
    if (cameraMode === 'follow' && car) {
        const cameraDistance = 8; // Reduced from 12 to 8 for closer view
        const cameraHeight = 3.5;
        
        // Calculate camera position directly behind car using negative direction vector
        const direction = new THREE.Vector3(
            Math.sin(carState.rotation.y),
            0,
            Math.cos(carState.rotation.y)
        ).normalize();

        // Position camera behind car
        camera.position.copy(carState.position)
            .sub(direction.multiplyScalar(cameraDistance))
            .add(new THREE.Vector3(0, cameraHeight, 0));

        // Create target point at car's height for level view
        const targetPoint = carState.position.clone()
            .add(new THREE.Vector3(0, cameraHeight * 0.5, 0));

        // Keep camera upright and looking at car
        camera.up.set(0, 1, 0);
        camera.lookAt(targetPoint);
    }
}

// Update car materials for bloom effect
function updateCarMaterials() {
    if (carModel) {
        carModel.traverse((node) => {
            if (node.isMesh && node.material) {
                if (node.name.includes('headlight') || node.name.includes('taillight')) {
                    node.material.emissive = new THREE.Color(0xffffff);
                    node.material.emissiveIntensity = 2.0;
                }
                if (node.name.includes('body') || node.name.includes('paint')) {
                    node.material.metalness = 0.8;
                    node.material.roughness = 0.2;
                    node.material.envMapIntensity = 1.5;
                }
            }
        });
    }
}

// Create road line markings
function createRoadLines(roadPoints) {
    if (!roadPoints || roadPoints.length < 2) return null;
    
    const lineGroup = new THREE.Group();
    
    // Material for white lines
    const lineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,    // Reduced from 1.5 to 0.4 for less glow
        roughness: 0.6,            // Increased from 0.2 to 0.6 for less shine
        metalness: 0.0,            // Removed metalness for more matte appearance
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        transparent: true,
        opacity: 0.9              // Slightly reduced opacity for better blending
    });

    // Create geometries for center and edge lines
    const positions = [];
    const indices = [];

    for (let i = 0; i < roadPoints.length - 1; i++) {
        const p1 = roadPoints[i];
        const p2 = roadPoints[i + 1];
        
        // Skip invalid points
        if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p1.z) || 
            isNaN(p2.x) || isNaN(p2.y) || isNaN(p2.z)) {
            continue;
        }
        
        // Calculate direction and normal
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const dirLength = dir.length();
        
        // Skip segments that are too short or zero-length
        if (dirLength < 0.001) continue;
        
        dir.normalize();
        const normal = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        
        // Validate normal
        if (isNaN(normal.x) || isNaN(normal.y) || isNaN(normal.z)) {
            continue;
        }
        
        // Line dimensions
        const lineWidth = 0.4;     // Width of the line
        const lineHeight = 0.05;   // Increased from 0.02 to 0.05
        const heightOffset = 0.01;  // Additional small offset to prevent z-fighting
        
        // Calculate if this segment should be visible (for dashed center line)
        const segmentLength = p1.distanceTo(p2);
        const isDashed = Math.floor(i / 3) % 2 === 0; // Creates dashed pattern
        
        if (isDashed) {
            // Center line vertices with adjusted height
            const centerLeft1 = new THREE.Vector3(
                p1.x + normal.x * lineWidth,
                p1.y + lineHeight + heightOffset,
                p1.z + normal.z * lineWidth
            );
            const centerRight1 = new THREE.Vector3(
                p1.x - normal.x * lineWidth,
                p1.y + lineHeight + heightOffset,
                p1.z - normal.z * lineWidth
            );
            const centerLeft2 = new THREE.Vector3(
                p2.x + normal.x * lineWidth,
                p2.y + lineHeight + heightOffset,
                p2.z + normal.z * lineWidth
            );
            const centerRight2 = new THREE.Vector3(
                p2.x - normal.x * lineWidth,
                p2.y + lineHeight + heightOffset,
                p2.z - normal.z * lineWidth
            );

            // Add vertices for center line
            const baseIndex = positions.length / 3;
            positions.push(
                centerLeft1.x, centerLeft1.y, centerLeft1.z,
                centerRight1.x, centerRight1.y, centerRight1.z,
                centerLeft2.x, centerLeft2.y, centerLeft2.z,
                centerRight2.x, centerRight2.y, centerRight2.z
            );
            
            indices.push(
                baseIndex, baseIndex + 1, baseIndex + 2,
                baseIndex + 2, baseIndex + 1, baseIndex + 3
            );
        }
        
        // Edge lines with adjusted height
        const edgeOffset = 11;
        
        // Left edge line with increased height
        const leftEdge1 = new THREE.Vector3(
            p1.x + normal.x * edgeOffset,
            p1.y + lineHeight + heightOffset,
            p1.z + normal.z * edgeOffset
        );
        const leftEdge2 = new THREE.Vector3(
            p2.x + normal.x * edgeOffset,
            p2.y + lineHeight + heightOffset,
            p2.z + normal.z * edgeOffset
        );
        
        // Right edge line with increased height
        const rightEdge1 = new THREE.Vector3(
            p1.x - normal.x * edgeOffset,
            p1.y + lineHeight + heightOffset,
            p1.z - normal.z * edgeOffset
        );
        const rightEdge2 = new THREE.Vector3(
            p2.x - normal.x * edgeOffset,
            p2.y + lineHeight + heightOffset,
            p2.z - normal.z * edgeOffset
        );

        // Add vertices for edge lines
        const edgeBaseIndex = positions.length / 3;
        
        // Left edge
        positions.push(
            leftEdge1.x, leftEdge1.y, leftEdge1.z,
            leftEdge1.x + normal.x * lineWidth, leftEdge1.y, leftEdge1.z + normal.z * lineWidth,
            leftEdge2.x, leftEdge2.y, leftEdge2.z,
            leftEdge2.x + normal.x * lineWidth, leftEdge2.y, leftEdge2.z + normal.z * lineWidth
        );
        
        // Right edge
        positions.push(
            rightEdge1.x, rightEdge1.y, rightEdge1.z,
            rightEdge1.x - normal.x * lineWidth, rightEdge1.y, rightEdge1.z - normal.z * lineWidth,
            rightEdge2.x, rightEdge2.y, rightEdge2.z,
            rightEdge2.x - normal.x * lineWidth, rightEdge2.y, rightEdge2.z - normal.z * lineWidth
        );
        
        indices.push(
            // Left edge
            edgeBaseIndex, edgeBaseIndex + 1, edgeBaseIndex + 2,
            edgeBaseIndex + 2, edgeBaseIndex + 1, edgeBaseIndex + 3,
            // Right edge
            edgeBaseIndex + 4, edgeBaseIndex + 5, edgeBaseIndex + 6,
            edgeBaseIndex + 6, edgeBaseIndex + 5, edgeBaseIndex + 7
        );
    }
    
    // Create geometry and add attributes
    const linesGeometry = new THREE.BufferGeometry();
    
    // Only add geometry if we have valid positions
    if (positions.length === 0) {
        console.warn('No valid positions generated for road lines');
        return null;
    }
    
    // Validate all positions before adding them
    for (let i = 0; i < positions.length; i++) {
        if (isNaN(positions[i])) {
            console.warn('Found NaN in positions array, skipping line creation');
            return null;
        }
    }
    
    linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Only set index if we have valid indices
    if (indices.length > 0) {
        linesGeometry.setIndex(indices);
    }
    
    linesGeometry.computeVertexNormals();
    
    // Create mesh with updated render settings
    const linesMesh = new THREE.Mesh(linesGeometry, lineMaterial);
    linesMesh.renderOrder = 2;     // Ensure lines render above road
    linesMesh.receiveShadow = true;
    linesMesh.castShadow = false;  // Don't cast shadows to improve performance
    
    return linesMesh;
}

// Sun helper functions removed - using atmospheric lighting only

// Load all textures
function loadTextures() {
    console.log('Loading textures...');
    return new Promise((resolve, reject) => {
        textureLoader.load(
            '/clouds/cloud1.png',
            (texture) => {
                console.log('Cloud texture loaded successfully');
                cloudTexture1 = texture;
                cloudTexture2 = texture; // Use same texture for consistency
                resolve();
            },
            undefined,
            (error) => {
                console.error('Error loading cloud texture:', error);
                reject(error);
            }
        );
    });
}

// Initialize textures and cloud system
loadTextures().then(() => {
    console.log('Textures loaded successfully');
}).catch(error => {
    console.error('Error loading textures:', error);
});

// Initialize car variables and functions before animation setup
let car = null;
let carModel = null;
const carScale = 0.02;
const carStartPosition = new THREE.Vector3(0, 0.5, 0);
const carRotation = new THREE.Euler(0, Math.PI / 2, 0);
let carRoll = 0;

// Car physics variables
const carState = {
    position: carStartPosition.clone(),
    rotation: new THREE.Euler(0, Math.PI / 2, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    acceleration: 0,
    steering: 0,
    drifting: false,
    speed: 0,
    driftAngle: 0,
    lastSteerDirection: 0,
    driftActive: false
};

// Car physics constants
const CAR_CONFIG = {
    maxSpeed: 100,
    acceleration: 35.0,
    deceleration: 2.0,
    brakeForce: 45.0,
    turnSpeed: 1.8,
    driftFactor: 0.85,
    gravity: 9.81,
    groundFriction: 0.95,
    driftingFriction: 1.0,
    maxDriftAngle: Math.PI / 2,
    driftBuildupRate: 0.075,
    driftRecoveryRate: 0.0006,
    visualDriftAngle: 0.3,
    driftSmoothing: 0.1,
    tireGrip: 1.0,
    minSpeedForDrift: 1.5,
    accelerationCurve: 1.0,
    reverseSpeed: 40,
    bodyRollFactor: 0.005,
    groundClearance: 0.5,
    steeringSmoothing: 0.92,
    steeringSpeed: 2.5,
    speedSteeringFactor: 0.7,
    minSteeringSpeed: 0.8
};

// Load the car model
function loadCarModel() {
    return new Promise((resolve, reject) => {
        console.log('Starting to load car model...');
        gltfLoader.load(
            '/ae86.glb',
            (gltf) => {
                console.log('Car model loaded successfully');
                carModel = gltf.scene;
                carModel.scale.set(carScale, carScale, carScale);
                carModel.position.copy(carStartPosition);
                carModel.rotation.copy(carRotation);
                
                carModel.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                        if (node.material) {
                            node.material.metalness = 0.4;
                            node.material.roughness = 0.6;
                        }
                    }
                });
                
                car = carModel;
                scene.add(car);
                console.log('Car model added to scene');
                resolve();
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(2);
                console.log(`Loading car model... ${percent}%`);
            },
            (error) => {
                console.error('Error loading car model:', error);
                reject(error);
            }
        );
    });
}

// Add fog for atmospheric effect
scene.fog = new THREE.Fog(0xff8533, 500, 3000); // Increased fog distances

// Update initialization
async function init() {
    // ... existing init code ...

    // Initialize cloud system
    await CloudSystem.setupClouds(scene, camera, carState.position, roadChunkManager.chunkSize);

    // ... rest of init code ...
}
