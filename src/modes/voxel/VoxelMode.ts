import { VoxelEditor } from './VoxelEditor';
import { voxelStore } from './voxelStore';

export class VoxelMode {
  private editor: VoxelEditor | null = null;
  private container: HTMLElement | null = null;
  private isActive: boolean = false;
  
  constructor() {
    console.log('[VoxelMode] Initializing...');
  }
  
  public init(container: HTMLElement): void {
    console.log('[VoxelMode] Initializing with container');
    this.container = container;
    
    // Initialize the editor if we have a container
    if (this.container) {
      this.editor = new VoxelEditor(this.container);
      this.editor.animate(); // Start animation loop
    }
  }
  
  public activate(): void {
    console.log('[VoxelMode] Activating');
    if (!this.isActive && this.container) {
      this.isActive = true;
      
      // If editor doesn't exist, create it
      if (!this.editor) {
        this.editor = new VoxelEditor(this.container);
        this.editor.animate();
      }
      
      // Make container visible
      this.container.style.display = 'block';
    }
  }
  
  public deactivate(): void {
    console.log('[VoxelMode] Deactivating');
    if (this.isActive && this.container) {
      this.isActive = false;
      
      // Hide container
      this.container.style.display = 'none';
    }
  }
  
  public setColor(color: number): void {
    if (this.editor) {
      voxelStore.setColor(color);
    }
  }
  
  public dispose(): void {
    console.log('[VoxelMode] Disposing');
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}
