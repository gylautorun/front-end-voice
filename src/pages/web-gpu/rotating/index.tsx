import { useEffect, useRef, useState } from 'react';
import { RotatingCube, createRotatingCube } from './rotating-cube';
import style from './index.module.scss';


export default function RotatingWebGpu() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cubeRef = useRef<RotatingCube | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cubeInstance: RotatingCube | null = null;

        const init = async () => {
            try {
                setIsLoading(true);
                setError(null);

                if (!canvasRef.current) {
                    throw new Error('Canvas element not found');
                }

                // 创建并初始化旋转立方体
                cubeInstance = await createRotatingCube(canvasRef.current);
                cubeRef.current = cubeInstance;
            } catch (err) {
                setError(err instanceof Error ? err.message : '初始化失败');
                console.error('Error initializing WebGPU:', err);
            } finally {
                setIsLoading(false);
            }
        };

        init();

        // 处理窗口大小变化
        const handleResize = () => {
            if (cubeInstance) {
                cubeInstance.resize();
            }
        };

        window.addEventListener('resize', handleResize);

        // 清理函数
        return () => {
            window.removeEventListener('resize', handleResize);
            if (cubeInstance) {
                cubeInstance.dispose();
            }
        };
    }, []);

    return (
        <div className={style.container}>
            <h1 className={style.title}>WebGPU 旋转立方体</h1>
            <div className={style.canvasContainer}>
                <canvas className={style.canvas} ref={canvasRef}></canvas>
                {isLoading && (
                    <div className={style.loading}>
                        <p>正在初始化 WebGPU...</p>
                    </div>
                )}
                {error && (
                    <div className={style.error}>
                        <h3>错误</h3>
                        <p>{error}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
