
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { ProjectPage, Wall, Door } from '../types';

interface ThreeDViewerProps {
  page: ProjectPage;
}

const WallMesh: React.FC<{ wall: Wall; scaleFactor: number }> = ({ wall, scaleFactor }) => {
  if (wall.points.length < 2) return null;
  
  const start = wall.points[0];
  const end = wall.points[1];
  
  const dx = (end.x - start.x) * scaleFactor;
  const dz = (end.y - start.y) * scaleFactor;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  
  const centerX = (start.x * scaleFactor + dx / 2);
  const centerZ = (start.y * scaleFactor + dz / 2);
  const height = wall.height || 2.8;
  const thickness = wall.thickness || 0.2;

  return (
    <mesh position={[centerX, height / 2, centerZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color={wall.color || "#e5e7eb"} roughness={0.7} />
    </mesh>
  );
};

const DoorMesh: React.FC<{ door: Door; scaleFactor: number }> = ({ door, scaleFactor }) => {
  if (door.points.length < 2) return null;
  
  const start = door.points[0];
  const end = door.points[1];
  
  const dx = (end.x - start.x) * scaleFactor;
  const dz = (end.y - start.y) * scaleFactor;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  
  const centerX = (start.x * scaleFactor + dx / 2);
  const centerZ = (start.y * scaleFactor + dz / 2);
  const height = 2.1; // Standard door height
  const thickness = 0.15;

  return (
    <mesh position={[centerX, height / 2, centerZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color="#92400e" roughness={0.5} transparent opacity={0.8} />
    </mesh>
  );
};

export const ThreeDViewer: React.FC<ThreeDViewerProps> = ({ page }) => {
  const scaleFactor = page.scale ? page.scale.realDistance / page.scale.pixelDistance : 0.01;

  // Calculate center of all walls to position camera
  const allPoints = [
    ...page.walls.flatMap(w => w.points),
    ...page.doors.flatMap(d => d.points),
    ...page.measurements.flatMap(m => m.points)
  ];
  
  const centerX = allPoints.length > 0 ? (allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length) * scaleFactor : 0;
  const centerZ = allPoints.length > 0 ? (allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length) * scaleFactor : 0;

  return (
    <div className="w-full h-full bg-[#1a1a1a]">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[centerX + 10, 10, centerZ + 10]} fov={50} />
        <OrbitControls target={[centerX, 0, centerZ]} makeDefault />
        
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <directionalLight 
          position={[-10, 20, 10]} 
          intensity={1} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />

        <Suspense fallback={null}>
          <Environment preset="city" />
          
          <group position={[0, 0, 0]}>
            {page.walls.map(wall => (
              <WallMesh key={wall.id} wall={wall} scaleFactor={scaleFactor} />
            ))}
            {page.doors.map(door => (
              <DoorMesh key={door.id} door={door} scaleFactor={scaleFactor} />
            ))}
          </group>

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.01, centerZ]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#333" roughness={0.8} />
          </mesh>
          
          <Grid 
            position={[centerX, 0, centerZ]} 
            args={[100, 100]} 
            sectionColor="#444" 
            cellColor="#222" 
            fadeDistance={50} 
            infiniteGrid 
          />
          
          <ContactShadows 
            position={[centerX, 0, centerZ]} 
            opacity={0.4} 
            scale={40} 
            blur={2} 
            far={4.5} 
          />
        </Suspense>
      </Canvas>
      
      <div className="absolute top-4 left-4 bg-black/60 text-white p-3 rounded-sm backdrop-blur-md border border-white/10">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-1">3D 預覽模式</h3>
        <p className="text-[10px] opacity-60">使用滑鼠左鍵旋轉，右鍵平移，滾輪縮放</p>
      </div>
    </div>
  );
};
