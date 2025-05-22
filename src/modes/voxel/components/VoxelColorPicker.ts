import { voxelStore } from '../voxelStore';

export class VoxelColorPicker {
  private container: HTMLElement;
  private colorPicker: HTMLInputElement;
  private predefinedColors: number[] = [
    0xff0000, // Red
    0x00ff00, // Green
    0x0000ff, // Blue
    0xffff00, // Yellow
    0xff00ff, // Magenta
    0x00ffff, // Cyan
    0xfeb74c, // Default orange
    0xffffff, // White
    0x000000, // Black
  ];
  
  constructor(container: HTMLElement) {
    this.container = container;
    
    // Create color picker UI
    this.colorPicker = this.createColorPicker();
    this.createPredefinedColorButtons();
    
    // Set initial color from store
    const initialColor = voxelStore.currentColor;
    this.updateColorPickerValue(initialColor);
  }
  
  private createColorPicker(): HTMLInputElement {
    const colorPickerContainer = document.createElement('div');
    colorPickerContainer.className = 'voxel-color-picker-container';
    colorPickerContainer.style.padding = '10px';
    
    const label = document.createElement('label');
    label.textContent = 'Voxel Color: ';
    label.style.marginRight = '8px';
    label.style.color = 'var(--text-color)';
    
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'voxel-color-picker';
    colorPicker.value = this.hexColorToString(voxelStore.currentColor);
    
    colorPicker.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const colorHex = this.stringToHexColor(target.value);
      voxelStore.setColor(colorHex);
    });
    
    colorPickerContainer.appendChild(label);
    colorPickerContainer.appendChild(colorPicker);
    this.container.appendChild(colorPickerContainer);
    
    return colorPicker;
  }
  
  private createPredefinedColorButtons(): void {
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'voxel-color-buttons';
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.flexWrap = 'wrap';
    buttonsContainer.style.gap = '5px';
    buttonsContainer.style.padding = '10px';
    
    this.predefinedColors.forEach(color => {
      const button = document.createElement('button');
      button.className = 'voxel-color-button';
      button.style.width = '24px';
      button.style.height = '24px';
      button.style.borderRadius = '4px';
      button.style.border = '1px solid #ccc';
      button.style.backgroundColor = this.hexColorToString(color);
      button.style.cursor = 'pointer';
      
      button.addEventListener('click', () => {
        voxelStore.setColor(color);
        this.updateColorPickerValue(color);
      });
      
      buttonsContainer.appendChild(button);
    });
    
    this.container.appendChild(buttonsContainer);
  }
  
  private updateColorPickerValue(hexColor: number): void {
    this.colorPicker.value = this.hexColorToString(hexColor);
  }
  
  // Convert hex number (0xff0000) to string format (#ff0000)
  private hexColorToString(hex: number): string {
    return `#${hex.toString(16).padStart(6, '0')}`;
  }
  
  // Convert string format (#ff0000) to hex number (0xff0000)
  private stringToHexColor(colorString: string): number {
    return parseInt(colorString.replace('#', ''), 16);
  }
}
