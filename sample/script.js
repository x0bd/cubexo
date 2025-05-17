let scene, camera, renderer, controls, canvas;
let soundLoader;
const soundFile = "inspiring-cinematic-ambient-255033.mp3";
let cube; // Will hold our cube object
let objLoader, textureLoader; // loaders
let voxelEarth;
const resolution = 125;
const span = 50;
const voxelSize = span / resolution;
const dummy = new THREE.Object3D();
const centre = new THREE.Vector3(0, 0, 0);
const simplex = new SimplexNoise();
const earthUpperlimit = 0.55;
const cloudsLowerLimit = 0.95;
let startingPositions = [];

// function for determing when we can ignore voxels
const isOutsideBounds = (normD) =>
	normD > 1 || (normD > earthUpperlimit && normD < cloudsLowerLimit);

let t = 0;
const gui = new lil.GUI();
const params = {
	noiseProgRate: 0.01,
	noiseZoom: 6,
	threshold: 0.66,
	cloudClumpage: 1.2,
	steepness: 2,
};
gui.add(params, "noiseProgRate", 0.001, 0.05, 0.0001);
gui.add(params, "noiseZoom", 0.1, 20, 0.1);
gui.add(params, "threshold", 0, 1, 0.01);
gui.add(params, "cloudClumpage", 0, 2, 0.01);
gui.add(params, "steepness", 0.5, 10, 0.1).name("Transition Steepness");

function init() {
	// 1. Scene setup
	scene = new THREE.Scene();

	// 2. Camera setup
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	// camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
	camera.position.set(span / 2, span / 2, span / 2);
	camera.lookAt(new THREE.Vector3(0, 0, 0));

	// 3. Renderer setup
	canvas = document.getElementById("threeCanvas");
	canvas.style.cursor = "none";
	renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	// renderer.setSize(1080, 1080);
	renderer.setClearColor(0x000000); // Black background

	// 4. Controls setup
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true; // Add damping for smoother interaction
	controls.dampingFactor = 0.1;
	controls.rotateSpeed = 0.5;

	// 5. Loaders
	objLoader = new THREE.OBJLoader();
	textureLoader = new THREE.TextureLoader();

	// 6. Add the earth

	// get starting positions
	for (let x = 0; x < resolution; x++) {
		for (let y = 0; y < resolution; y++) {
			for (let z = 0; z < resolution; z++) {
				let position = new THREE.Vector3(
					-span / 2 + x * voxelSize,
					-span / 2 + y * voxelSize,
					-span / 2 + z * voxelSize
				);
				let normD =
					Math.sqrt(
						position.x ** 2 + position.y ** 2 + position.z ** 2
					) /
					(span / 2);
				if (isOutsideBounds(normD)) continue;
				startingPositions.push({
					p: position.clone(),
					col: getInstanceColor(normD),
					d: normD,
				});
			}
		}
	}

	// use those to make the InstancedMesh
	const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
	const material = new THREE.MeshStandardMaterial();
	voxelEarth = new THREE.InstancedMesh(
		geometry,
		material,
		startingPositions.length
	);
	scene.add(voxelEarth);

	for (let i = 0; i < startingPositions.length; i++) {
		let voxel = startingPositions[i];
		dummy.position.set(voxel.p.x, voxel.p.y, voxel.p.z);
		dummy.updateMatrix();
		voxelEarth.setMatrixAt(i, dummy.matrix);

		// update the colour based on bands
		voxelEarth.setColorAt(i, voxel.col);
	}

	voxelEarth.instanceMatrix.needsUpdate = true;
	voxelEarth.instanceColor.needsUpdate = true;

	// 7. Event Listeners
	window.addEventListener("resize", handleWindowResize, false);
	// document.addEventListener('keydown', handleKeyDown, false);
	// document.addEventListener('mousedown', handleMouseDown, false); // Example of mouse event

	// 8. Lighting Setup
	setupLights();

	// 9. Sound
	audioLoader = new THREE.AudioLoader();
	const listener = new THREE.AudioListener();
	camera.add(listener);
	audioLoader.load(
		soundFile,
		function (buffer) {
			// Audio loading is complete, you can now create and play sounds
			console.log("Audio file loaded:", soundFile);

			// Example: Create and play background music (non-positional)
			const backgroundSound = new THREE.Audio(listener);
			backgroundSound.setBuffer(buffer);
			backgroundSound.setLoop(true); // Optional: Loop the sound
			backgroundSound.setVolume(0.75); // Optional: Adjust the volume
			backgroundSound.play();
		},
		function (xhr) {
			console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
		},
		function (error) {
			console.error("An error happened during the audio loading:", error);
		}
	);

	animate(); // Start the animation loop
}

function animate() {
	requestAnimationFrame(animate);
	t += params.noiseProgRate;

	// Rotate the voxel earth
	if (voxelEarth) {
		voxelEarth.rotation.x += 0.01;
		voxelEarth.rotation.y += 0.01;

		// Update all voxels based on simplex noise
		for (let i = 0; i < startingPositions.length; i++) {
			let voxel = startingPositions[i];
			// Get adaptive noiseZoom
			let adaptiveNoiseZoom =
				voxel.d >= cloudsLowerLimit
					? params.cloudClumpage * params.noiseZoom
					: params.noiseZoom;

			// Get the current noise value for this position
			let noiseValue = getSimplexValue(voxel.p, adaptiveNoiseZoom, t);

			// Get adaptive threshold based on distance
			let adaptiveThreshold = getThresholdForDistance(voxel.d);

			// Reset the dummy object transformation
			let scaleFactor = getVoxelScale(
				noiseValue,
				adaptiveThreshold,
				params.steepness
			);
			dummy.scale.set(scaleFactor, scaleFactor, scaleFactor);
			dummy.position.set(voxel.p.x, voxel.p.y, voxel.p.z);

			// Apply the filtering conditions
			if (noiseValue < adaptiveThreshold) dummy.scale.set(0, 0, 0);

			dummy.updateMatrix();

			voxelEarth.setMatrixAt(i, dummy.matrix);
		}

		voxelEarth.instanceMatrix.needsUpdate = true;
	}

	controls.update(); // Update controls (required for damping)
	renderer.render(scene, camera);
}

function handleWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleKeyDown(event) {
	console.log("Key Down:", event.key);
	// Example: Change camera position on key press
	if (event.key === "ArrowUp") {
		camera.position.z -= 0.5;
	} else if (event.key === "ArrowDown") {
		camera.position.z += 0.5;
	}
}

function handleMouseDown(event) {
	console.log("Mouse Down:", event.button);
	// Example: Log which mouse button was pressed
	switch (event.button) {
		case 0:
			console.log("Left mouse button");
			break;
		case 1:
			console.log("Middle mouse button");
			break;
		case 2:
			console.log("Right mouse button");
			break;
	}
}

function setupLights() {
	// 1. Ambient Light - Provides a base level of illumination
	ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
	scene.add(ambientLight);

	// 2. Directional Light - Simulates sunlight, has direction
	directionalLight = new THREE.DirectionalLight(0xffffff, 1); // White light, intensity 1
	directionalLight.position.set(5, 5, 5); // Position the light
	directionalLight.castShadow = true; // Enable shadows for this light
	directionalLight.shadow.mapSize.width = 1024; // Shadow map size
	directionalLight.shadow.mapSize.height = 1024;
	directionalLight.shadow.camera.near = 0.5; // Shadow camera near plane
	directionalLight.shadow.camera.far = 20; // Shadow camera far plane
	scene.add(directionalLight);

	// 3. Point Light - Emits light from a single point in all directions
	pointLight = new THREE.PointLight(0xff0000, 2, 10); // Red light, intensity 2, distance 10
	pointLight.position.set(-2, 2, -2); // Position the light
	pointLight.castShadow = true; // Point lights can cast shadows, but it's expensive.
	pointLight.shadow.mapSize.width = 512;
	pointLight.shadow.mapSize.height = 512;
	pointLight.shadow.camera.near = 0.1;
	pointLight.shadow.camera.far = 10;
	scene.add(pointLight);

	// Helper for directional light (optional, for visualization)
	// const directionalLightHelper = new THREE.DirectionalLightHelper(directionalLight, 1);
	// scene.add(directionalLightHelper);
	// const pointLightHelper = new THREE.PointLightHelper(pointLight, 1);
	// scene.add(pointLightHelper);
}

// Call the init function to set up the scene
init();

/**
 * Returns a Three.js Color based on a gradient determined by the input value
 * with dynamically calculated band transitions
 * @param {number} d - Value between 0 and 1
 * @param {Object} bands - Object containing upper limit values for each band
 * @returns {THREE.Color} - Color object based on the input value
 */
function getInstanceColor(
	d,
	bands = {
		core: 0.2, // white to gold
		mantle: 0.4, // gold to red
		crust: 0.5, // red to brown
		surface: earthUpperlimit, // brown to green
		highAtmo: cloudsLowerLimit, // green to dark grey
		clouds: 1.0, // dark grey to white
	}
) {
	// Ensure d is within bounds
	d = Math.max(0, Math.min(1, d));

	// Define our color stops
	const colors = {
		white: new THREE.Color(0xffffff),
		gold: new THREE.Color(0xffd700),
		red: new THREE.Color(0xff0000),
		brown: new THREE.Color(0x5c4033),
		green: new THREE.Color(0x008000),
		darkGrey: new THREE.Color(0xa9a9a9),
	};

	// Create the resulting color
	let resultColor = new THREE.Color();

	// Sort the bands to ensure proper order
	const sortedBands = Object.entries(bands).sort((a, b) => a[1] - b[1]);

	// Define previous band value start at 0
	let prevBandValue = 0;

	// Find which band the value falls into
	for (let i = 0; i < sortedBands.length; i++) {
		const [bandName, bandLimit] = sortedBands[i];

		if (d <= bandLimit) {
			// Calculate normalized position within this band (0-1)
			const bandWidth = bandLimit - prevBandValue;
			const t = bandWidth > 0 ? (d - prevBandValue) / bandWidth : 0;

			// Determine colors to lerp between based on band
			let fromColor, toColor;

			switch (i) {
				case 0: // First band (core)
					fromColor = colors.white;
					toColor = colors.gold;
					break;
				case 1: // Second band (mantle)
					fromColor = colors.gold;
					toColor = colors.red;
					break;
				case 2: // Third band (crust)
					fromColor = colors.red;
					toColor = colors.brown;
					break;
				case 3: // Fourth band (lowAtmo)
					fromColor = colors.brown;
					toColor = colors.green;
					break;
				case 4: // Fifth band (highAtmo)
					fromColor = colors.green;
					toColor = colors.darkGrey;
					break;
				case 5: // Sixth band (clouds)
					fromColor = colors.darkGrey;
					toColor = colors.white;
					break;
				default: // Fallback
					fromColor = colors.darkGrey;
					toColor = colors.white;
			}

			// Interpolate between the colors
			resultColor.copy(fromColor).lerp(toColor, t);
			return resultColor;
		}

		prevBandValue = bandLimit;
	}

	// Fallback if value doesn't match any band (shouldn't happen if bands go to 1.0)
	return new THREE.Color(0xffffff);
}

/**
 * Returns a location-based noise value between 0 and 1
 * @param {THREE.Vector3} p - position in 3D space
 * @param {double} noiseZoom - value to scale the 4D noise
 * @param {double} t - time component
 * @returns {double} - A double in the interval [0,1]
 */
function getSimplexValue(p, noiseZoom, t) {
	return (
		0.5 *
		(simplex.noise4D(p.x / noiseZoom, p.y / noiseZoom, p.z / noiseZoom, t) +
			1)
	);
}

const mapVal = (val, srcMin, srcMax, targetMin, targetMax) =>
	((targetMax - targetMin) * val) / (srcMax - srcMin);

function getThresholdForDistance(normD) {
	// Make threshold higher (more selective) near the edges
	// and lower (less selective) near the center

	if (normD < 0.3) {
		return params.threshold * 0.5; // More lenient near core
	} else if (normD < 0.6) {
		return params.threshold * 0.8; // Slightly more strict
	} else {
		return params.threshold * 1.2; // Stricter at the edges
	}
}

/**
 * Creates a smooth transition between 0 and 1 based on where the input falls between edge0 and edge1
 * @param {number} edge0 - The lower edge of the transition (returns 0 when x <= edge0)
 * @param {number} edge1 - The upper edge of the transition (returns 1 when x >= edge1)
 * @param {number} x - The input value
 * @returns {number} - Smoothly interpolated value between 0 and 1
 */
function smoothstep(edge0, edge1, x) {
	// Clamp x to the range [0, 1]
	x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));

	// Apply the smoothstep formula: 3x² - 2x³ (Hermite interpolation)
	return x * x * (3 - 2 * x);
}

/**
 * Enhanced smoothstep with steeper transition (more dramatic curve)
 * @param {number} edge0 - The lower edge of the transition
 * @param {number} edge1 - The upper edge of the transition
 * @param {number} x - The input value
 * @param {number} power - Power to raise the smoothstep result to (higher = steeper)
 * @returns {number} - Smoothly interpolated value between 0 and 1 with steeper transition
 */
function smoothstepSteep(edge0, edge1, x, power = 2) {
	// Get the basic smoothstep value
	const t = smoothstep(edge0, edge1, x);

	// Apply the power to make the transition steeper
	return Math.pow(t, power);
}

/**
 * Apply smoothstep to voxel scaling based on noise threshold
 * @param {number} noiseValue - Current noise value for this voxel (0-1)
 * @param {number} threshold - Threshold below which voxels should start disappearing
 * @param {number} steepness - Controls how steep the transition is (higher = steeper)
 * @returns {number} - Scale factor between 0 and 1
 */
function getVoxelScale(noiseValue, threshold, steepness = 2) {
	// Define edge0 as slightly below threshold
	const edge0 = Math.max(0, threshold - 0.1);
	const edge1 = threshold;

	// Apply smoothstep and return the scale
	return smoothstepSteep(edge0, edge1, noiseValue, steepness);
}
