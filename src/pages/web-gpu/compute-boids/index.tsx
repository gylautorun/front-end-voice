import { useEffect, useRef, useState } from 'react';
import { createComputeBoids, ComputeBoids } from './compute-boids';
import style from './index.module.scss';

export default function ComputeBoidsDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boidsRef = useRef<ComputeBoids | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current) {
        setError('Canvas element not found');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const boids = await createComputeBoids(canvasRef.current);
        boidsRef.current = boids;
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize Compute Boids');
        console.error('Error initializing Compute Boids:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (boidsRef.current) {
        boidsRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className={style.container}>
      <h1>Compute Boids Simulation</h1>
      {isLoading && <div className={style.loading}>Loading Compute Boids...</div>}
      {error && <div className={style.error}>{error}</div>}
      <canvas ref={canvasRef} className={style.canvas} width={800} height={600} />
    </div>
  );
}
