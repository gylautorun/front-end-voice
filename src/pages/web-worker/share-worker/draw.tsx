
export interface Coordinates {x: number, y: number}
export interface WindowState {
    screenX: number; // window.screenX
    screenY: number; // window.screenY
    width: number; // window.innerWidth
    height: number; // window.innerHeight
};

function getWindowCenter(window: WindowState) {
    const {width, height} = window;
    const x = window.screenX + width / 2;
    const y = window.screenY + height / 2;
    return {x, y};
}
class Draw {
    drawCenterCircle = (ctx: CanvasRenderingContext2D, center: Coordinates) => {
        const {x, y} = center;
        ctx.strokeStyle = '#EEE';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(x, y, 100, 0, Math.PI * 2, false);
        ctx.stroke();
        ctx.closePath();
    };

    baseChange = ({
        currentWindowOffset,
        targetWindowOffset,
        targetPosition,
    }: {
        currentWindowOffset: Coordinates;
        targetWindowOffset: Coordinates;
        targetPosition: Coordinates;
    }) => {
        const monitorCoordinate = {
            x: targetPosition.x + targetWindowOffset.x,
            y: targetPosition.y + targetWindowOffset.y,
        };

        const currentWindowCoordinate = {
            x: monitorCoordinate.x - currentWindowOffset.x,
            y: monitorCoordinate.y - currentWindowOffset.y,
        };

        return currentWindowCoordinate;
    };

    drawConnectingLine = ({
        ctx,
        hostWindow,
        targetWindow,
    }: {
        ctx: CanvasRenderingContext2D;
        hostWindow: WindowState;
        targetWindow: WindowState;
    }) => {
        ctx.strokeStyle = '#FF0000';
        ctx.lineCap = 'round';
        const currentWindowOffset: Coordinates = {
            x: hostWindow.screenX,
            y: hostWindow.screenY,
        };
        const targetWindowOffset: Coordinates = {
            x: targetWindow.screenX,
            y: targetWindow.screenY,
        };
        const origin = getWindowCenter(hostWindow);
        const target = getWindowCenter(targetWindow);
        const targetWithBaseChange = this.baseChange({
            currentWindowOffset,
            targetWindowOffset,
            targetPosition: target,
        });
        
        ctx.strokeStyle = '#FF0000';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(targetWithBaseChange.x, targetWithBaseChange.y);
        ctx.stroke();
        ctx.closePath();
    };
}