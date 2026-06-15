import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import FloatingOrbs from './FloatingOrbs';

export default function Scene3D() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <FloatingOrbs />
        </Suspense>
      </Canvas>
    </div>
  );
}
