import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { voxelStore } from './voxelStore';

export class VoxelEditor {
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private plane: THREE.Mesh;
  private pointer: THREE.Vector2;
  private raycaster: THREE.Raycaster;
  private isShiftDown: boolean = false;
  private rollOverMesh: THREE.Mesh;
  private rollOverMaterial: THREE.MeshBasicMaterial;
  private cubeGeo: THREE.BoxGeometry;
  private cubeMaterial: THREE.MeshLambertMaterial;
  private objects: THREE.Object3D[] = [];
  private container: HTMLElement;
  private controls: OrbitControls;
  private currentColor: number = 0xfeb74c; // Default color
  private voxelSize: number = 50;
  private gridSize: number = 1000;
  private gridDivisions: number = 20;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    
    // Initialize scene, camera, renderer
    this.initScene();
    this.initCamera();
    this.initRenderer();
    
    // Initialize helpers and objects
    this.initRollOverMesh();
    this.initCubeGeometry();
    this.initGrid();
    this.initPlane();
    this.initLights();
    
    // Initialize controls
    this.initOrbitControls();
    
    // Add event listeners
    this.addEventListeners();
    
    // Initial render
    this.render();
    
    // Subscribe to color changes from the store
    voxelStore.subscribe(() => {
      this.updateCubeColor(voxelStore.currentColor);
    });
  }
  
  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);
  }
  
  private initCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      45, 
      this.container.clientWidth / this.container.clientHeight, 
      1, 
      10000
    );
    this.camera.position.set(500, 800, 1300);
    this.camera.lookAt(0, 0, 0);
  }
  
  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
  }
  
  private initRollOverMesh(): void {
    const rollOverGeo = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
    this.rollOverMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      opacity: 0.5, 
      transparent: true 
    });
    this.rollOverMesh = new THREE.Mesh(rollOverGeo, this.rollOverMaterial);
    this.scene.add(this.rollOverMesh);
  }
  
  private initCubeGeometry(): void {
    // Load texture for cubes
    const textureLoader = new THREE.TextureLoader();
    const map = textureLoader.load('/textures/square-outline-textured.png');
    map.colorSpace = THREE.SRGBColorSpace;
    
    this.cubeGeo = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
    this.cubeMaterial = new THREE.MeshLambertMaterial({ 
      color: this.currentColor, 
      map: map 
    });
  }
  
  private initGrid(): void {
    const gridHelper = new THREE.GridHelper(this.gridSize, this.gridDivisions);
    this.scene.add(gridHelper);
  }
  
  private initPlane(): void {
    const geometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
    geometry.rotateX(-Math.PI / 2);
    
    this.plane = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.scene.add(this.plane);
    this.objects.push(this.plane);
  }
  
  private initLights(): void {
    const ambientLight = new THREE.AmbientLight(0x606060, 3);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    directionalLight.position.set(1, 0.75, 0.5).normalize();
    this.scene.add(directionalLight);
  }
  
  private initOrbitControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 3000;
    this.controls.maxPolarAngle = Math.PI / 2;
    
    // Update the renderer when controls change
    this.controls.addEventListener('change', () => this.render());
  }
  
  private addEventListeners(): void {
    // Mouse events
    this.renderer.domElement.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    
    // Keyboard events
    window.addEventListener('keydown', (event) => this.onDocumentKeyDown(event));
    window.addEventListener('keyup', (event) => this.onDocumentKeyUp(event));
    
    // Window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  private onWindowResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.render();
  }
  
  private onPointerMove(event: PointerEvent): void {
    // Calculate pointer position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    const intersects = this.raycaster.intersectObjects(this.objects, false);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      
      this.rollOverMesh.position.copy(intersect.point).add(intersect.face!.normal);
      this.rollOverMesh.position
        .divideScalar(this.voxelSize)
        .floor()
        .multiplyScalar(this.voxelSize)
        .addScalar(this.voxelSize / 2);
      
      this.render();
    }
  }
  
  private onPointerDown(event: PointerEvent): void {
    // Only handle left clicks
    if (event.button !== 0) return;
    
    // Calculate pointer position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    const intersects = this.raycaster.intersectObjects(this.objects, false);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      
      // Delete cube
      if (this.isShiftDown) {
        if (intersect.object !== this.plane) {
          this.scene.remove(intersect.object);
          this.objects.splice(this.objects.indexOf(intersect.object), 1);
        }
      } 
      // Create cube
      else {
        const voxel = new THREE.Mesh(this.cubeGeo, this.cubeMaterial);
        voxel.position.copy(intersect.point).add(intersect.face!.normal);
        voxel.position
          .divideScalar(this.voxelSize)
          .floor()
          .multiplyScalar(this.voxelSize)
          .addScalar(this.voxelSize / 2);
        this.scene.add(voxel);
        this.objects.push(voxel);
      }
      
      this.render();
    }
  }
  
  private onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftDown = true;
    }
  }
  
  private onDocumentKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftDown = false;
    }
  }
  
  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
  
  public updateCubeColor(color: number): void {
    this.currentColor = color;
    this.cubeMaterial.color.setHex(color);
    this.rollOverMaterial.color.setHex(color);
    this.render();
  }
  
  public animate(): void {
    requestAnimationFrame(() => this.animate());
    this.controls.update(); // Only required if controls.enableDamping = true
    this.render();
  }
  
  public dispose(): void {
    // Remove event listeners
    this.renderer.domElement.removeEventListener('pointermove', (event) => this.onPointerMove(event));
    this.renderer.domElement.removeEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.removeEventListener('keydown', (event) => this.onDocumentKeyDown(event));
    window.removeEventListener('keyup', (event) => this.onDocumentKeyUp(event));
    window.removeEventListener('resize', () => this.onWindowResize());
    
    // Dispose of Three.js objects
    this.scene.remove(this.rollOverMesh);
    this.rollOverMaterial.dispose();
    this.cubeGeo.dispose();
    this.cubeMaterial.dispose();
    
    // Remove renderer from DOM
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
