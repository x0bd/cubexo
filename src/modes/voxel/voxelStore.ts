// Simple state management without React dependencies
export class VoxelStore {
  private static instance: VoxelStore;
  private _currentColor: number = 0xfeb74c; // Default orange color
  private _voxelSize: number = 50;
  private _activeTool: 'add' | 'remove' | 'paint' = 'add';
  private listeners: Function[] = [];
  
  private constructor() {}
  
  public static getInstance(): VoxelStore {
    if (!VoxelStore.instance) {
      VoxelStore.instance = new VoxelStore();
    }
    return VoxelStore.instance;
  }
  
  // Getters
  public get currentColor(): number {
    return this._currentColor;
  }
  
  public get voxelSize(): number {
    return this._voxelSize;
  }
  
  public get activeTool(): 'add' | 'remove' | 'paint' {
    return this._activeTool;
  }
  
  // Setters with notification
  public setColor(color: number): void {
    this._currentColor = color;
    this.notifyListeners();
  }
  
  public setVoxelSize(size: number): void {
    this._voxelSize = size;
    this.notifyListeners();
  }
  
  public setActiveTool(tool: 'add' | 'remove' | 'paint'): void {
    this._activeTool = tool;
    this.notifyListeners();
  }
  
  // Subscribe to changes
  public subscribe(listener: Function): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

// Export a singleton instance
export const voxelStore = VoxelStore.getInstance();
