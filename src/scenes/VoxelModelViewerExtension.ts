import { VoxelModelViewer } from './VoxelModelViewer';

// Extend the VoxelModelViewer class with additional methods
declare module './VoxelModelViewer' {
  interface VoxelModelViewer {
    setVisible(visible: boolean): void;
  }
}

// Add the setVisible method to the VoxelModelViewer prototype
VoxelModelViewer.prototype.setVisible = function(visible: boolean): void {
  const canvasElement = document.getElementById('webgl') as HTMLCanvasElement;
  if (canvasElement) {
    canvasElement.style.display = visible ? 'block' : 'none';
  }
};
