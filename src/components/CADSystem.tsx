import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Group, Arc } from 'react-konva';
import { MousePointer2, Move, Square, Circle as CircleIcon, Minus, Pencil, Type, Trash2, Undo, Redo, Download, Grid3X3, Settings2, Columns, Ruler, Maximize, DoorOpen, PanelLeft, Layers as LayersIcon, Eye, EyeOff, Lock, Unlock, Plus } from 'lucide-react';
import { CADPage, CADShape, Point, Scale, CADLayer } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface CADSystemProps {
  page: CADPage | null;
  updatePage: (updates: Partial<CADPage>) => void;
}

type CADTool = 'select' | 'line' | 'rect' | 'circle' | 'text' | 'pan' | 'door_swing' | 'door_sliding' | 'window' | 'dimension' | 'scale';

export const CADSystem: React.FC<CADSystemProps> = ({ page, updatePage }) => {
  const [tool, setTool] = useState<CADTool>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [history, setHistory] = useState<CADShape[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Settings
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState(false);
  
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleLine, setScaleLine] = useState<Point[] | null>(null);
  const [scaleInput, setScaleInput] = useState('100');
  const [scaleUnitInput, setScaleUnitInput] = useState('cm');

  const [panStart, setPanStart] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  const [textPromptData, setTextPromptData] = useState<{show: boolean, point: Point | null, text: string}>({show: false, point: null, text: ''});

  const stageRef = useRef<any>(null);

  const layers = page?.layers || [{ id: 'default-layer', name: '圖層 0', visible: true, locked: false }];
  const activeLayerId = page?.activeLayerId || layers[0].id;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      if (e.key === 'Escape') {
        setIsDrawing(false);
        setCurrentPoints([]);
        setSelectedIds([]);
        setTool('select');
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0 && page) {
          saveHistory(page.shapes);
          updatePage({ shapes: page.shapes.filter(s => !selectedIds.includes(s.id)) });
          setSelectedIds([]);
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === 'y') {
          handleRedo();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        setIsMiddleMouseDown(false);
        setPanStart(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedIds, page, history, historyStep]);

  // Initial history setup
  useEffect(() => {
    if (page && history.length === 0) {
      setHistory([page.shapes]);
      setHistoryStep(0);
    }
  }, [page?.id]);

  const saveHistory = (oldShapes: CADShape[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(oldShapes);
    // Keep last 50 steps
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0 && page) {
      setHistoryStep(prev => prev - 1);
      updatePage({ shapes: history[historyStep - 1] });
      setSelectedIds([]);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1 && page) {
      setHistoryStep(prev => prev + 1);
      updatePage({ shapes: history[historyStep + 1] });
      setSelectedIds([]);
    }
  };

  const getSnappedPoint = (pos: Point): Point => {
    if (!snapToGrid || !page) return pos;
    const snapSize = page.gridSize;
    return {
      x: Math.round(pos.x / snapSize) * snapSize,
      y: Math.round(pos.y / snapSize) * snapSize
    };
  };

  const getFormatDistance = (p1: Point, p2: Point) => {
    let px = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (page?.scale) {
      const real = (px / page.scale.pixelDistance) * page.scale.realDistance;
      return `${real.toFixed(2)} ${page.scale.unit}`;
    }
    return `${px.toFixed(1)} px`;
  };

  const getDistanceNumber = (p1: Point, p2: Point) => {
    let px = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (page?.scale) {
      return (px / page.scale.pixelDistance) * page.scale.realDistance;
    }
    return px;
  };

  const handleMouseDown = (e: any) => {
    if (e.evt.button === 1) {
      setIsMiddleMouseDown(true);
      setPanStart({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }
    if (isSpacePressed || tool === 'pan') return;
    if (!page) return;

    const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'grid-background';
    if (clickedOnEmpty && tool === 'select') {
      const stage = e.target.getStage();
      let point = stage.getRelativePointerPosition();
      setSelectionBox({ start: point, current: point });
      if (!e.evt.shiftKey) {
        setSelectedIds([]);
      }
      return;
    }

    if (tool !== 'select') {
      const stage = e.target.getStage();
      let point = stage.getRelativePointerPosition();
      point = getSnappedPoint(point);

      if (tool === 'text') {
        setTextPromptData({ show: true, point, text: '' });
        return;
      }

      if (!isDrawing) {
        setIsDrawing(true);
        setCurrentPoints([point, point]);
      } else {
        // Finish drawing
        setIsDrawing(false);
        if (tool === 'scale') {
           setScaleLine([currentPoints[0], point]);
           setScaleModalOpen(true);
           setCurrentPoints([]);
           setTool('select');
           return;
        }

        saveHistory(page.shapes);
        const newShape: CADShape = {
          id: generateId(),
          type: tool as CADShape['type'],
          points: [currentPoints[0], point],
          color: strokeColor,
          strokeWidth: strokeWidth,
          layerId: activeLayerId
        };
        
        if (tool === 'dimension') {
          newShape.value = getDistanceNumber(currentPoints[0], point);
          newShape.unit = page?.scale?.unit || 'px';
        }

        updatePage({ shapes: [...page.shapes, newShape] });
        setCurrentPoints([]);
        // Multi-draw logic can be added here
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (selectionBox) {
      const stage = e.target.getStage();
      let point = stage.getRelativePointerPosition();
      setSelectionBox({ ...selectionBox, current: point });
      return;
    }

    if (isMiddleMouseDown && panStart && page) {
      const dx = e.evt.clientX - panStart.x;
      const dy = e.evt.clientY - panStart.y;
      updatePage({ stagePos: { x: page.stagePos.x + dx, y: page.stagePos.y + dy } });
      setPanStart({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }

    if (!isDrawing || !page) return;
    const stage = e.target.getStage();
    let point = stage.getRelativePointerPosition();
    point = getSnappedPoint(point);

    if (e.evt.shiftKey && currentPoints.length > 0) {
      const start = currentPoints[0];
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      point = {
        x: start.x + Math.cos(snappedAngle) * dist,
        y: start.y + Math.sin(snappedAngle) * dist
      };
      point = getSnappedPoint(point);
    }

    setCurrentPoints(prev => [prev[0], point]);
  };

  const handleStageMouseUp = (e: any) => {
    if (selectionBox) {
        let minX = Math.min(selectionBox.start.x, selectionBox.current.x);
        let maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
        let minY = Math.min(selectionBox.start.y, selectionBox.current.y);
        let maxY = Math.max(selectionBox.start.y, selectionBox.current.y);

        const toSelect = page?.shapes.filter(shape => {
            const shapeLayerId = shape.layerId || 'default-layer';
            if (shapeLayerId !== activeLayerId) return false;
            
            const layer = layers.find(l => l.id === shapeLayerId);
            if (layer && (!layer.visible || layer.locked)) return false;

            let shapeMinX = Infinity;
            let shapeMaxX = -Infinity;
            let shapeMinY = Infinity;
            let shapeMaxY = -Infinity;

            shape.points.forEach(p => {
                shapeMinX = Math.min(shapeMinX, p.x);
                shapeMaxX = Math.max(shapeMaxX, p.x);
                shapeMinY = Math.min(shapeMinY, p.y);
                shapeMaxY = Math.max(shapeMaxY, p.y);
            });

            if (shape.type === 'circle') {
                 const dx = shape.points[1].x - shape.points[0].x;
                 const dy = shape.points[1].y - shape.points[0].y;
                 const r = Math.sqrt(dx*dx + dy*dy);
                 shapeMinX = shape.points[0].x - r;
                 shapeMaxX = shape.points[0].x + r;
                 shapeMinY = shape.points[0].y - r;
                 shapeMaxY = shape.points[0].y + r;
            }

            return (
                shapeMaxX >= minX && shapeMinX <= maxX &&
                shapeMaxY >= minY && shapeMinY <= maxY
            );
        });
        
        const newIds = toSelect?.map(s => s.id) || [];
        if (e.evt.shiftKey) {
            setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
        } else {
            setSelectedIds(newIds);
        }
        
        setSelectionBox(null);
    }
  };

  const handleWheel = (e: any) => {
    if (!page) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    
    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const boundedScale = Math.max(0.1, Math.min(newScale, 10));

    updatePage({
      stageScale: boundedScale,
      stagePos: {
        x: pointer.x - mousePointTo.x * boundedScale,
        y: pointer.y - mousePointTo.y * boundedScale,
      }
    });
  };

  const handleShapeClick = (id: string, e: any) => {
    if (tool === 'select') {
      e.cancelBubble = true;
      if (e.evt.shiftKey) {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
      } else {
        setSelectedIds([id]);
      }
    }
  };

  const handleShapeDragEnd = (e: any, id: string) => {
    if (!page) return;
    saveHistory(page.shapes);
    
    // Update shape positions
    const shape = page.shapes.find(s => s.id === id);
    if (!shape) return;

    const node = e.target;
    // Calculate displacement
    let originalX = 0;
    let originalY = 0;

    if (shape.type === 'rect') {
      originalX = Math.min(shape.points[0].x, shape.points[1].x);
      originalY = Math.min(shape.points[0].y, shape.points[1].y);
    } else if (shape.type === 'circle' || shape.type === 'text') {
      originalX = shape.points[0].x;
      originalY = shape.points[0].y;
    } else if (shape.type === 'door_swing' || shape.type === 'door_sliding' || shape.type === 'window') {
      originalX = shape.points[0].x;
      originalY = shape.points[0].y;
    }

    const dx = node.x() - originalX;
    const dy = node.y() - originalY;

    if (dx === 0 && dy === 0) return;
    
    // Reset the node's position because we are modifying the root points
    node.position({ x: originalX, y: originalY });
    
    // We snap the resulting points, but we only calculate delta here. The snapping happens inside map.
    const newShapes = page.shapes.map(s => {
      if (s.id === id || selectedIds.includes(s.id)) {
        return {
          ...s,
          points: s.points.map(p => {
             let nx = p.x + dx;
             let ny = p.y + dy;
             if (snapToGrid) {
                 nx = Math.round(nx / page.gridSize) * page.gridSize;
                 ny = Math.round(ny / page.gridSize) * page.gridSize;
             }
             return { x: nx, y: ny };
          })
        };
      }
      return s;
    });

    updatePage({ shapes: newShapes });
  };

  // Generate grid background
  const renderGrid = () => {
    if (!page) return null;
    const gridSize = page.gridSize;
    const scale = page.stageScale;
    
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    
    const startX = -Math.ceil(page.stagePos.x / scale / gridSize) * gridSize - gridSize;
    const startY = -Math.ceil(page.stagePos.y / scale / gridSize) * gridSize - gridSize;
    const endX = startX + Math.ceil(winWidth / scale / gridSize) * gridSize + 2*gridSize;
    const endY = startY + Math.ceil(winHeight / scale / gridSize) * gridSize + 2*gridSize;

    const lines = [];
    for (let x = startX; x <= endX; x += gridSize) {
      lines.push(
        <Line 
          key={`vx-${x}`}
          points={[x, startY, x, endY]}
          stroke={x === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}
          strokeWidth={1/scale}
          listening={false}
        />
      );
    }
    for (let y = startY; y <= endY; y += gridSize) {
      lines.push(
        <Line 
          key={`vy-${y}`}
          points={[startX, y, endX, y]}
          stroke={y === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}
          strokeWidth={1/scale}
          listening={false}
        />
      );
    }
    return lines;
  };

  if (!page) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A0A0A] text-[#E4E3E0]">
        <div className="text-center opacity-50">
          <p>請先新增圖紙或選擇左側的圖紙開始繪圖</p>
        </div>
      </div>
    );
  }

  const isPanning = isSpacePressed || isMiddleMouseDown || tool === 'pan';

  return (
    <div className="flex-1 flex flex-col bg-[#0A0A0A] relative overflow-hidden">
      {/* CAD Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-1.5 flex gap-1 items-center">
        <ToolBtn icon={<MousePointer2 size={18} />} active={tool === 'select'} onClick={() => setTool('select')} title="選取 (V)" />
        <ToolBtn icon={<Move size={18} />} active={tool === 'pan'} onClick={() => setTool('pan')} title="平移 (H / Space)" />
        <div className="w-[1px] h-6 bg-[#2a2a2a] mx-1" />
        <ToolBtn icon={<Minus size={18} />} active={tool === 'line'} onClick={() => setTool('line')} title="直線 (L)" />
        <ToolBtn icon={<Square size={18} />} active={tool === 'rect'} onClick={() => setTool('rect')} title="矩形 (R)" />
        <ToolBtn icon={<CircleIcon size={18} />} active={tool === 'circle'} onClick={() => setTool('circle')} title="圓形 (C)" />
        <ToolBtn icon={<Type size={18} />} active={tool === 'text'} onClick={() => setTool('text')} title="文字 (T)" />
        <div className="w-[1px] h-6 bg-[#2a2a2a] mx-1" />
        <ToolBtn icon={<DoorOpen size={18} />} active={tool === 'door_swing'} onClick={() => setTool('door_swing')} title="推拉門" />
        <ToolBtn icon={<PanelLeft size={18} />} active={tool === 'door_sliding'} onClick={() => setTool('door_sliding')} title="橫拉門" />
        <ToolBtn icon={<Columns size={18} />} active={tool === 'window'} onClick={() => setTool('window')} title="窗" />
        <ToolBtn icon={<Ruler size={18} />} active={tool === 'dimension'} onClick={() => setTool('dimension')} title="尺寸標註" />
        <ToolBtn icon={<Maximize size={18} />} active={tool === 'scale'} onClick={() => setTool('scale')} title="設定比例尺" />
        <div className="w-[1px] h-6 bg-[#2a2a2a] mx-1" />
        <ToolBtn 
          icon={<Grid3X3 size={18} className={snapToGrid ? "text-[#00FF55]" : ""} />} 
          active={false} 
          onClick={() => setSnapToGrid(!snapToGrid)} 
          title="網格鎖定" 
        />
        <ToolBtn icon={<Undo size={18} />} active={false} onClick={handleUndo} disabled={historyStep <= 0} title="復原 (Ctrl+Z)" />
        <ToolBtn icon={<Redo size={18} />} active={false} onClick={handleRedo} disabled={historyStep >= history.length - 1} title="重做 (Ctrl+Y)" />
        <ToolBtn icon={<Trash2 size={18} />} active={false} onClick={() => {
           if (selectedIds.length > 0) {
             saveHistory(page.shapes);
             updatePage({ shapes: page.shapes.filter(s => !selectedIds.includes(s.id)) });
             setSelectedIds([]);
           }
        }} disabled={selectedIds.length === 0} title="刪除選取" />
      </div>

      {/* Properties Panel (if selected) */}
      <div className="absolute right-4 top-4 z-10 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-3 flex flex-col gap-3 w-48">
        <div className="text-xs font-medium text-white/50 uppercase tracking-widest shrink-0">屬性配置</div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-[#E4E3E0]">繪圖顏色</label>
          <div className="flex gap-1.5 flex-wrap">
            {['#ffffff', '#ff3333', '#00ff55', '#33aaff', '#ffaa33'].map(c => (
              <button 
                key={c}
                onClick={() => {
                  setStrokeColor(c);
                  if (selectedIds.length > 0) {
                    saveHistory(page.shapes);
                    updatePage({ shapes: page.shapes.map(s => selectedIds.includes(s.id) ? { ...s, color: c } : s) });
                  }
                }}
                className={`w-6 h-6 rounded-full border-2 ${strokeColor === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-[#E4E3E0]">線條粗細 {strokeWidth}px</label>
          <input 
            type="range" min="1" max="10" step="1" 
            value={strokeWidth} 
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setStrokeWidth(val);
              if (selectedIds.length > 0) {
                saveHistory(page.shapes);
                updatePage({ shapes: page.shapes.map(s => selectedIds.includes(s.id) ? { ...s, strokeWidth: val } : s) });
              }
            }}
            className="w-full accent-[#00FF55]" 
          />
        </div>
      </div>

      {/* Layer Management Panel */}
      <div className="absolute left-4 top-4 z-10 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-3 flex flex-col gap-3 w-56">
        <div className="flex items-center justify-between text-xs font-medium text-white/50 uppercase tracking-widest shrink-0">
          <div className="flex items-center gap-1">
            <LayersIcon size={14} /> 圖層管理
          </div>
          <button 
            onClick={() => {
              const newLayer = { id: generateId(), name: `圖層 ${layers.length}`, visible: true, locked: false };
              updatePage({
                layers: [...layers, newLayer],
                activeLayerId: newLayer.id
              });
            }} 
            className="hover:text-white"
            title="新增圖層"
          >
            <Plus size={14}/>
          </button>
        </div>
        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
            {layers.map(layer => (
              <div 
                key={layer.id}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${activeLayerId === layer.id ? 'bg-[#2a2a2a]' : 'hover:bg-[#1a1a1a]'}`}
                onClick={() => {
                  updatePage({ activeLayerId: layer.id });
                  setSelectedIds([]);
                }}
              >
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePage({
                      layers: layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l)
                    });
                    if (layer.visible) {
                      // Deselect shapes on this layer when hiding
                      const hiddenShapeIds = page.shapes.filter(s => (s.layerId || 'default-layer') === layer.id).map(s => s.id);
                      setSelectedIds(prev => prev.filter(id => !hiddenShapeIds.includes(id)));
                    }
                  }}
                  className="text-white/50 hover:text-white"
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePage({
                      layers: layers.map(l => l.id === layer.id ? { ...l, locked: !l.locked } : l)
                    });
                  }}
                  className="text-white/50 hover:text-white"
                >
                  {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <input 
                  type="text"
                  value={layer.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    updatePage({
                      layers: layers.map(l => l.id === layer.id ? { ...l, name: e.target.value } : l)
                    });
                  }}
                  className="bg-transparent border-none outline-none text-sm text-[#E4E3E0] flex-1 min-w-0"
                />
                {layer.id !== 'default-layer' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`確定要刪除圖層 "${layer.name}" 及其所有內容嗎？`)) {
                        updatePage({
                          layers: layers.filter(l => l.id !== layer.id),
                          activeLayerId: activeLayerId === layer.id ? 'default-layer' : activeLayerId,
                          shapes: page.shapes.filter(s => (s.layerId || 'default-layer') !== layer.id)
                        });
                      }
                    }}
                    className="text-white/30 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>

      <div className={`w-full h-full ${isPanning ? 'cursor-grab active:cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}>
        <Stage
          width={window.innerWidth - 320} // Assuming sidebar width
          height={window.innerHeight}
          scaleX={page.stageScale}
          scaleY={page.stageScale}
          x={page.stagePos.x}
          y={page.stagePos.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleStageMouseUp}
          onWheel={handleWheel}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              updatePage({ stagePos: { x: e.target.x(), y: e.target.y() } });
            }
          }}
          ref={stageRef}
          draggable={isPanning}
        >
          <Layer>
            <Rect 
              name="grid-background"
              x={-page.stagePos.x / page.stageScale}
              y={-page.stagePos.y / page.stageScale}
              width={window.innerWidth / page.stageScale}
              height={window.innerHeight / page.stageScale}
              fill="transparent"
            />
            {renderGrid()}
          </Layer>
          <Layer>
            {selectionBox && (
              <Rect
                x={Math.min(selectionBox.start.x, selectionBox.current.x)}
                y={Math.min(selectionBox.start.y, selectionBox.current.y)}
                width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
                height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
                fill="rgba(0, 255, 85, 0.1)"
                stroke="rgba(0, 255, 85, 0.4)"
                strokeWidth={1 / page.stageScale}
                listening={false}
              />
            )}
            {page.shapes.map((shape) => {
              const layer = layers.find(l => l.id === (shape.layerId || 'default-layer'));
              if (layer && !layer.visible) return null;
              const isLocked = layer?.locked || false;

              const isActiveLayer = (shape.layerId || 'default-layer') === activeLayerId;
              const canEdit = isActiveLayer && !isLocked;

              const isSelected = selectedIds.includes(shape.id);
              const stroke = isSelected ? '#00FF55' : shape.color;
              const opacity = isSelected ? 1 : 0.9;
              
              const commonProps = {
                stroke,
                strokeWidth: shape.strokeWidth / page.stageScale,
                opacity,
                draggable: tool === 'select' && canEdit,
                listening: canEdit,
                onClick: (e: any) => { if (canEdit) handleShapeClick(shape.id, e); },
                onDragStart: (e: any) => { if (canEdit) handleShapeClick(shape.id, e); },
                onDragEnd: (e: any) => { if (canEdit) handleShapeDragEnd(e, shape.id); },
                onDblClick: (e: any) => {
                  if (!canEdit) return;
                  if (tool === 'select' && (shape.type === 'door_swing' || shape.type === 'door_sliding')) {
                    e.cancelBubble = true;
                    saveHistory(page.shapes);
                    const isX = shape.flipX || false;
                    const isY = shape.flipY || false;
                    let nextX = isX;
                    let nextY = isY;
                    
                    if (!isX && !isY)      { nextX = true;  nextY = false; }
                    else if (isX && !isY)  { nextX = true;  nextY = true;  }
                    else if (isX && isY)   { nextX = false; nextY = true;  }
                    else                   { nextX = false; nextY = false; }

                    updatePage({
                      shapes: page.shapes.map(s => s.id === shape.id ? { ...s, flipX: nextX, flipY: nextY } : s)
                    });
                  }
                },
                onMouseEnter: (e: any) => { if (tool === 'select') e.target.getStage().container().style.cursor = 'move'; },
                onMouseLeave: (e: any) => { if (tool === 'select') e.target.getStage().container().style.cursor = 'default'; }
              };

              if (shape.type === 'line' && shape.points.length === 2) {
                return (
                  <Line 
                    key={shape.id}
                    {...commonProps}
                    points={[shape.points[0].x, shape.points[0].y, shape.points[1].x, shape.points[1].y]}
                  />
                );
              }
              if (shape.type === 'rect' && shape.points.length === 2) {
                const x = Math.min(shape.points[0].x, shape.points[1].x);
                const y = Math.min(shape.points[0].y, shape.points[1].y);
                const width = Math.abs(shape.points[1].x - shape.points[0].x);
                const height = Math.abs(shape.points[1].y - shape.points[0].y);
                return (
                  <Rect 
                    key={shape.id}
                    {...commonProps}
                    x={x} y={y} width={width} height={height}
                  />
                );
              }
              if (shape.type === 'circle' && shape.points.length === 2) {
                const dx = shape.points[1].x - shape.points[0].x;
                const dy = shape.points[1].y - shape.points[0].y;
                const radius = Math.sqrt(dx*dx + dy*dy);
                return (
                  <Circle 
                    key={shape.id}
                    {...commonProps}
                    x={shape.points[0].x} y={shape.points[0].y} radius={radius}
                  />
                );
              }
              if (shape.type === 'text' && shape.text) {
                return (
                  <Text 
                    key={shape.id}
                    {...commonProps}
                    x={shape.points[0].x} y={shape.points[0].y}
                    text={shape.text}
                    fontSize={16 * strokeWidth / page.stageScale * 2} // Scale text relative to stroke/zoom
                    fill={stroke}
                    strokeEnabled={false}
                  />
                );
              }
              if (shape.type === 'door_swing' && shape.points.length === 2) {
                const [p1, p2] = shape.points;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const length = Math.sqrt(dx*dx + dy*dy);
                const scaleX = shape.flipX ? -1 : 1;
                const scaleY = shape.flipY ? -1 : 1;
                return (
                  <Group key={shape.id} {...commonProps} x={p1.x} y={p1.y} rotation={angle}>
                    <Group scaleX={scaleX} scaleY={scaleY}>
                       <Line points={[0, 0, length, 0]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} dash={[5, 5]} />
                       <Line points={[0, 0, 0, -length]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                       <Arc x={0} y={0} innerRadius={length} outerRadius={length} angle={90} rotation={-90} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    </Group>
                  </Group>
                );
              }
              if (shape.type === 'door_sliding' && shape.points.length === 2) {
                const [p1, p2] = shape.points;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const length = Math.sqrt(dx*dx + dy*dy);
                const thickness = 10 / page.stageScale;
                const scaleX = shape.flipX ? -1 : 1;
                const scaleY = shape.flipY ? -1 : 1;
                return (
                  <Group key={shape.id} {...commonProps} x={p1.x} y={p1.y} rotation={angle}>
                    <Group scaleX={scaleX} scaleY={scaleY}>
                       <Rect x={0} y={-thickness} width={length/2} height={thickness} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                       <Rect x={length/2} y={0} width={length/2} height={thickness} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    </Group>
                  </Group>
                );
              }
              if (shape.type === 'window' && shape.points.length === 2) {
                const [p1, p2] = shape.points;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const length = Math.sqrt(dx*dx + dy*dy);
                const thickness = 10 / page.stageScale;
                return (
                  <Group key={shape.id} {...commonProps} x={p1.x} y={p1.y} rotation={angle}>
                    <Rect x={0} y={-thickness/2} width={length} height={thickness} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    <Line points={[0, 0, length, 0]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                  </Group>
                );
              }
              if (shape.type === 'dimension' && shape.points.length === 2) {
                const [p1, p2] = shape.points;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const length = Math.sqrt(dx*dx + dy*dy);
                const text = `${shape.value?.toFixed(1) || length.toFixed(1)} ${shape.unit || 'px'}`;
                return (
                  <Group key={shape.id} {...commonProps}>
                    <Line points={[p1.x, p1.y, p2.x, p2.y]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    <Line points={[p1.x - dy*0.05, p1.y + dx*0.05, p1.x + dy*0.05, p1.y - dx*0.05]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    <Line points={[p2.x - dy*0.05, p2.y + dx*0.05, p2.x + dy*0.05, p2.y - dx*0.05]} stroke={stroke} strokeWidth={shape.strokeWidth / page.stageScale} />
                    <Text 
                      x={(p1.x + p2.x) / 2} 
                      y={(p1.y + p2.y) / 2 - 15 / page.stageScale} 
                      text={text} 
                      fill={stroke} 
                      fontSize={14 / page.stageScale} 
                      align="center"
                      offsetX={((text.length * 8) / 2) / page.stageScale} 
                    />
                  </Group>
                );
              }
              return null;
            })}

            {/* Drawing Preview */}
            {isDrawing && currentPoints.length === 2 && (
              <Group>
                {(tool === 'line' || tool === 'door_swing' || tool === 'door_sliding' || tool === 'window' || tool === 'dimension' || tool === 'scale') && (
                  <Line 
                    points={[currentPoints[0].x, currentPoints[0].y, currentPoints[1].x, currentPoints[1].y]}
                    stroke={strokeColor} strokeWidth={strokeWidth / page.stageScale} opacity={0.6}
                  />
                )}
                {(tool === 'line' || tool === 'door_swing' || tool === 'door_sliding' || tool === 'window' || tool === 'dimension' || tool === 'scale') && (
                  <Text 
                    x={currentPoints[1].x + 10 / page.stageScale} 
                    y={currentPoints[1].y + 10 / page.stageScale} 
                    text={getFormatDistance(currentPoints[0], currentPoints[1])}
                    fill="#00FF55"
                    fontSize={14 / page.stageScale}
                    shadowColor="black"
                    shadowBlur={4}
                    strokeEnabled={false}
                  />
                )}
                {tool === 'rect' && (
                  <Rect 
                    x={Math.min(currentPoints[0].x, currentPoints[1].x)}
                    y={Math.min(currentPoints[0].y, currentPoints[1].y)}
                    width={Math.abs(currentPoints[1].x - currentPoints[0].x)}
                    height={Math.abs(currentPoints[1].y - currentPoints[0].y)}
                    stroke={strokeColor} strokeWidth={strokeWidth / page.stageScale} opacity={0.6}
                  />
                )}
                {tool === 'circle' && (
                  <Circle 
                    x={currentPoints[0].x} y={currentPoints[0].y}
                    radius={Math.sqrt(Math.pow(currentPoints[1].x - currentPoints[0].x, 2) + Math.pow(currentPoints[1].y - currentPoints[0].y, 2))}
                    stroke={strokeColor} strokeWidth={strokeWidth / page.stageScale} opacity={0.6}
                  />
                )}
              </Group>
            )}
          </Layer>
        </Stage>
      </div>
      <AnimatePresence>
        {textPromptData.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#1a1a1a] p-6 rounded-2xl shadow-2xl border border-[#2a2a2a] w-96 flex flex-col gap-4"
            >
              <h3 className="text-white font-medium">輸入文字內容</h3>
              <input
                autoFocus
                type="text"
                value={textPromptData.text}
                onChange={(e) => setTextPromptData(prev => ({ ...prev, text: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textPromptData.point && textPromptData.text) {
                    saveHistory(page.shapes);
                    const newShape: CADShape = {
                      id: generateId(),
                      type: 'text',
                      points: [textPromptData.point],
                      color: strokeColor,
                      strokeWidth: strokeWidth,
                      text: textPromptData.text,
                      layerId: activeLayerId
                    };
                    updatePage({ shapes: [...page.shapes, newShape] });
                    setTextPromptData({ show: false, point: null, text: '' });
                    setTool('select');
                  } else if (e.key === 'Escape') {
                    setTextPromptData({ show: false, point: null, text: '' });
                    setTool('select');
                  }
                }}
                className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00FF55] transition-colors"
                placeholder="輸入文字..."
              />
              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => {
                    setTextPromptData({ show: false, point: null, text: '' });
                    setTool('select');
                  }}
                  className="px-4 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (textPromptData.point && textPromptData.text) {
                      saveHistory(page.shapes);
                      const newShape: CADShape = {
                        id: generateId(),
                        type: 'text',
                        points: [textPromptData.point],
                        color: strokeColor,
                        strokeWidth: strokeWidth,
                        text: textPromptData.text,
                        layerId: activeLayerId
                      };
                      updatePage({ shapes: [...page.shapes, newShape] });
                      setTextPromptData({ show: false, point: null, text: '' });
                      setTool('select');
                    }
                  }}
                  disabled={!textPromptData.text}
                  className="px-4 py-2 rounded-lg bg-[#00FF55] text-black font-medium hover:bg-[#00e64d] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  確認
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scale Setting Modal */}
      {scaleModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-[#E4E3E0] font-bold text-lg mb-4">設定比例尺大小</h3>
            <p className="text-white/60 text-xs mb-4">請輸入這條線的實際長度與單位。</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1">實際長度</label>
                <input 
                  type="number"
                  value={scaleInput}
                  onChange={(e) => setScaleInput(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded block p-2 text-[#E4E3E0] focus:border-[#00FF55] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">單位 (例如：cm, m, in)</label>
                <input 
                  type="text"
                  value={scaleUnitInput}
                  onChange={(e) => setScaleUnitInput(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded block p-2 text-[#E4E3E0] focus:border-[#00FF55] outline-none"
                />
              </div>
              
              <div className="flex gap-2 justify-end mt-6">
                <button 
                  onClick={() => {
                    setScaleModalOpen(false);
                    setScaleLine(null);
                  }}
                  className="px-4 py-2 rounded text-sm text-white/60 hover:text-white"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (scaleLine && scaleLine.length === 2 && parseFloat(scaleInput) > 0) {
                      const pxDist = Math.sqrt(Math.pow(scaleLine[1].x - scaleLine[0].x, 2) + Math.pow(scaleLine[1].y - scaleLine[0].y, 2));
                      updatePage({
                        scale: {
                          pixelDistance: pxDist,
                          realDistance: parseFloat(scaleInput),
                          unit: scaleUnitInput
                        }
                      });
                    }
                    setScaleModalOpen(false);
                    setScaleLine(null);
                  }}
                  className="px-4 py-2 rounded text-sm bg-[#00FF55] text-black font-semibold hover:bg-green-400 cursor-pointer"
                >
                  設定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({ icon, active, onClick, disabled = false, title }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded-lg transition-all ${
      active ? 'bg-[#2a2a2a] text-[#00FF55]' : 
      disabled ? 'opacity-30 cursor-not-allowed' :
      'hover:bg-[#1a1a1a] text-[#E4E3E0]'
    }`}
  >
    {icon}
  </button>
);
