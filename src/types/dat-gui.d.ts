declare module 'dat.gui' {
  interface Controller {
    onFinishChange(callback: () => void): Controller;
  }

  export class GUI {
    constructor(params?: {
      autoPlace?: boolean;
      container?: HTMLElement;
      width?: number;
      closeOnTop?: boolean;
      load?: any;
      preset?: string;
    });

    add(object: any, property: string, min?: number, max?: number, step?: number): Controller;
    addColor(object: any, property: string): Controller;
    addFolder(name: string): GUI;
    open(): void;
    close(): void;
    destroy(): void;
  }
}
