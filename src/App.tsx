/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Ruler, 
  Square, 
  Trash2, 
  Settings, 
  Plus, 
  Check, 
  X, 
  History, 
  MousePointer2,
  Download,
  Maximize2,
  Minimize2,
  Info,
  Edit3,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { Tool, Point, Measurement, Scale } from './types';

// Utility to calculate distance between two points
const getDistance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Utility to calculate total path length
const getPathLength = (points: Point[]) => {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += getDistance(points[i], points[i + 1]);
  }
  return total;
};

// Utility to calculate polygon area using Shoelace formula
const getPolygonArea = (points: Point[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
};

// 1 Ping = 3.305785 m2
const M2_TO_PING = 0.3025;

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [image] = useImage(imageSrc || '');
  const [tool, setTool] = useState<Tool>('select');
  const [scale, setScale] = useState<Scale | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [tempPixelDist, setTempPixelDist] = useState(0);
  const [scaleInput, setScaleInput] = useState({ value: '', unit: 'm' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [lengthColor, setLengthColor] = useState('#3b82f6');
  const [areaColor, setAreaColor] = useState('#10b981');

  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);

  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setMeasurements([]);
        setScale(null);
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle stage mouse events
  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();

    if (tool === 'select') {
      if (e.target === stage) {
        setSelectedIds([]);
      }
      return;
    }

    if (tool === 'scale') {
      if (!isDrawing) {
        setCurrentPoints([point]);
        setIsDrawing(true);
      } else {
        const dist = getDistance(currentPoints[0], point);
        setTempPixelDist(dist);
        setCurrentPoints([...currentPoints, point]);
        setIsDrawing(false);
        setShowScaleModal(true);
      }
    } else if (tool === 'length') {
      if (!isDrawing) {
        setCurrentPoints([point]);
        setIsDrawing(true);
      } else {
        // Check if clicking near the last point to finish
        const lastPoint = currentPoints[currentPoints.length - 1];
        const distToLast = getDistance(point, lastPoint);
        
        if (distToLast < 10 / stageScale && currentPoints.length > 1) {
          finishMeasurement();
        } else {
          setCurrentPoints([...currentPoints, point]);
        }
      }
    } else if (tool === 'area') {
      if (!isDrawing) {
        setCurrentPoints([point]);
        setIsDrawing(true);
      } else {
        // Check if clicking near the first point to close the polygon
        const firstPoint = currentPoints[0];
        const distToFirst = getDistance(point, firstPoint);
        
        if (distToFirst < 10 / stageScale && currentPoints.length > 2) {
          finishMeasurement();
        } else {
          setCurrentPoints([...currentPoints, point]);
        }
      }
    }
  };

  const finishMeasurement = () => {
    if (!scale || currentPoints.length < 2) return;

    if (tool === 'length') {
      const pixelDist = getPathLength(currentPoints);
      const realDist = (pixelDist / scale.pixelDistance) * scale.realDistance;
      const newMeasurement: Measurement = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'length',
        points: currentPoints,
        value: realDist,
        unit: scale.unit,
        label: `長度測量 ${measurements.length + 1}`,
        color: lengthColor
      };
      setMeasurements([...measurements, newMeasurement]);
    } else if (tool === 'area') {
      if (currentPoints.length < 3) return;
      const pixelArea = getPolygonArea(currentPoints);
      const realArea = pixelArea * Math.pow(scale.realDistance / scale.pixelDistance, 2);
      const newMeasurement: Measurement = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'area',
        points: currentPoints,
        value: realArea,
        unit: `${scale.unit}²`,
        label: `面積測量 ${measurements.length + 1}`,
        color: areaColor
      };
      setMeasurements([...measurements, newMeasurement]);
    }
    setCurrentPoints([]);
    setIsDrawing(false);
  };

  const cancelDrawing = () => {
    setCurrentPoints([]);
    setIsDrawing(false);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();
    setPreviewPoint(point);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setStagePos(newPos);
  };

  const saveScale = () => {
    const realDist = parseFloat(scaleInput.value);
    if (!isNaN(realDist) && realDist > 0) {
      setScale({
        pixelDistance: tempPixelDist,
        realDistance: realDist,
        unit: scaleInput.unit
      });
      setShowScaleModal(false);
      setTool('select');
      setCurrentPoints([]);
    }
  };

  const deleteMeasurement = (id: string) => {
    setMeasurements(measurements.filter(m => m.id !== id));
    setSelectedIds(selectedIds.filter(sid => sid !== id));
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const startEditing = (m: Measurement) => {
    setEditingId(m.id);
    setEditLabel(m.label);
  };

  const saveEdit = () => {
    if (editingId) {
      setMeasurements(measurements.map(m => 
        m.id === editingId ? { ...m, label: editLabel } : m
      ));
      setEditingId(null);
    }
  };

  const updateMeasurementColor = (id: string, color: string) => {
    setMeasurements(measurements.map(m => 
      m.id === id ? { ...m, color } : m
    ));
  };

  const getPingValue = (value: number, unit: string) => {
    let m2Value = 0;
    const u = unit.toLowerCase();
    if (u === 'm²' || u === 'm2') m2Value = value;
    else if (u === 'cm²' || u === 'cm2') m2Value = value / 10000;
    else if (u === 'mm²' || u === 'mm2') m2Value = value / 1000000;
    else if (u === 'ft²' || u === 'ft2') m2Value = value * 0.092903;
    else if (u === 'in²' || u === 'in2') m2Value = value * 0.00064516;
    else return null;

    return (m2Value * M2_TO_PING).toFixed(2);
  };

  const downloadCSV = () => {
    if (measurements.length === 0) return;
    
    const headers = ['名稱', '類型', '數值', '單位', '坪數'];
    const rows = measurements.map(m => [
      m.label,
      m.type === 'length' ? '長度' : '面積',
      m.value.toFixed(2),
      m.unit,
      m.type === 'area' ? getPingValue(m.value, m.unit) || '-' : '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', '測量紀錄.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveProject = () => {
    if (!imageSrc) return;
    const projectData = {
      imageSrc,
      scale,
      measurements,
      stageScale,
      stagePos,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `測量專案_${new Date().toLocaleDateString()}.meas`);
    link.click();
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          setImageSrc(data.imageSrc);
          setScale(data.scale);
          setMeasurements(data.measurements);
          setStageScale(data.stageScale || 1);
          setStagePos(data.stagePos || { x: 0, y: 0 });
          setSelectedIds([]);
          setTool('select');
        } catch (err) {
          alert('讀取專案檔案失敗，請確保檔案格式正確。');
        }
      };
      reader.readAsText(file);
    }
  };

  const getTotals = () => {
    const selectedItems = measurements.filter(m => selectedIds.includes(m.id));
    if (selectedItems.length === 0) return null;

    const totals: { [key: string]: { value: number, unit: string, type: string } } = {};
    
    selectedItems.forEach(m => {
      const key = `${m.type}-${m.unit}`;
      if (!totals[key]) {
        totals[key] = { value: 0, unit: m.unit, type: m.type };
      }
      totals[key].value += m.value;
    });

    return Object.values(totals);
  };

  const totals = getTotals();

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-[#141414] flex flex-col bg-[#E4E3E0] z-10">
        <div className="p-6 border-bottom border-[#141414]">
          <h1 className="text-2xl font-serif italic mb-2">影像測量工具</h1>
          <p className="text-xs opacity-60 uppercase tracking-widest">專業影像測量與標註</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Tools */}
          <section>
            <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider mb-3">工具箱</h2>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton 
                active={tool === 'select'} 
                onClick={() => setTool('select')} 
                icon={<MousePointer2 size={18} />} 
                label="選取" 
              />
              <ToolButton 
                active={tool === 'scale'} 
                onClick={() => {
                  setTool('scale');
                  setCurrentPoints([]);
                  setIsDrawing(false);
                }} 
                icon={<Settings size={18} />} 
                label="設定比例" 
                disabled={!imageSrc}
              />
              <div className="relative group">
                <ToolButton 
                  active={tool === 'length'} 
                  onClick={() => {
                    setTool('length');
                    setCurrentPoints([]);
                    setIsDrawing(false);
                  }} 
                  icon={<Ruler size={18} />} 
                  label="長度測量" 
                  disabled={!scale}
                />
                {!(!scale) && (
                  <input 
                    type="color" 
                    value={lengthColor} 
                    onChange={(e) => setLengthColor(e.target.value)}
                    className="absolute top-1 right-1 w-4 h-4 p-0 border-none bg-transparent cursor-pointer"
                    title="設定預設長度顏色"
                  />
                )}
              </div>
              <div className="relative group">
                <ToolButton 
                  active={tool === 'area'} 
                  onClick={() => {
                    setTool('area');
                    setCurrentPoints([]);
                    setIsDrawing(false);
                  }} 
                  icon={<Square size={18} />} 
                  label="面積測量" 
                  disabled={!scale}
                />
                {!(!scale) && (
                  <input 
                    type="color" 
                    value={areaColor} 
                    onChange={(e) => setAreaColor(e.target.value)}
                    className="absolute top-1 right-1 w-4 h-4 p-0 border-none bg-transparent cursor-pointer"
                    title="設定預設面積顏色"
                  />
                )}
              </div>
            </div>
          </section>

          {/* Scale Info */}
          {scale && (
            <section className="p-3 border border-[#141414] rounded-sm bg-white/50">
              <h2 className="text-[10px] font-mono uppercase tracking-tighter opacity-50 mb-1">目前比例尺</h2>
              <div className="flex justify-between items-end">
                <span className="text-lg font-mono">{scale.realDistance} {scale.unit}</span>
                <span className="text-[10px] opacity-50 font-mono">≈ {Math.round(scale.pixelDistance)} 像素</span>
              </div>
            </section>
          )}

          {/* Help Button */}
          <section>
            <button 
              onClick={() => setShowHelpModal(true)}
              className="w-full p-3 border border-[#141414] bg-white/40 hover:bg-white/80 transition-all flex items-center justify-center gap-2"
            >
              <Info size={16} />
              <span className="text-[10px] uppercase tracking-widest font-bold">使用說明</span>
            </button>
          </section>

          {/* Project Management */}
          <section>
            <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider mb-3">專案管理</h2>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={saveProject}
                disabled={!imageSrc}
                className="flex flex-col items-center justify-center gap-2 p-3 border border-[#141414] bg-white/40 hover:bg-white/80 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                <span className="text-[10px] uppercase tracking-widest font-bold">儲存專案</span>
              </button>
              <button 
                onClick={() => projectInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 p-3 border border-[#141414] bg-white/40 hover:bg-white/80 transition-all"
              >
                <History size={16} />
                <span className="text-[10px] uppercase tracking-widest font-bold">開啟專案</span>
              </button>
              <input 
                type="file" 
                ref={projectInputRef} 
                className="hidden" 
                accept=".meas" 
                onChange={loadProject} 
              />
            </div>
          </section>

          {/* Measurements List */}
          <section className="flex-1">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider">測量紀錄</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-40">{measurements.length} 筆</span>
                {measurements.length > 0 && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const areaIds = measurements.filter(m => m.type === 'area').map(m => m.id);
                        const allAreasSelected = areaIds.every(id => selectedIds.includes(id)) && areaIds.length > 0;
                        if (allAreasSelected) {
                          setSelectedIds(selectedIds.filter(id => !areaIds.includes(id)));
                        } else {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...areaIds])));
                        }
                      }}
                      className="text-[10px] text-emerald-600 hover:underline"
                    >
                      全選面積
                    </button>
                    <button 
                      onClick={() => {
                        const lengthIds = measurements.filter(m => m.type === 'length').map(m => m.id);
                        const allLengthsSelected = lengthIds.every(id => selectedIds.includes(id)) && lengthIds.length > 0;
                        if (allLengthsSelected) {
                          setSelectedIds(selectedIds.filter(id => !lengthIds.includes(id)));
                        } else {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...lengthIds])));
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      全選長度
                    </button>
                    <button 
                      onClick={() => {
                        if (selectedIds.length === measurements.length) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(measurements.map(m => m.id));
                        }
                      }}
                      className="text-[10px] text-gray-500 hover:underline"
                    >
                      {selectedIds.length === measurements.length ? '取消全選' : '全選全部'}
                    </button>
                    <button 
                      onClick={downloadCSV}
                      className="text-[10px] text-gray-500 hover:underline flex items-center gap-1"
                    >
                      <Download size={10} /> 匯出
                    </button>
                    <button 
                      onClick={() => {
                        if (confirm('確定要刪除所有測量紀錄嗎？')) {
                          setMeasurements([]);
                          setSelectedIds([]);
                        }
                      }}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      全部刪除
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Selection Summary */}
            {totals && (
              <div className="mb-4 p-3 bg-[#141414] text-[#E4E3E0] rounded-sm shadow-inner">
                <h3 className="text-[10px] uppercase tracking-widest opacity-50 mb-2">選取統計</h3>
                <div className="space-y-2">
                  {totals.map((t, i) => (
                    <div key={i} className="flex justify-between items-end border-b border-white/10 pb-1 last:border-0">
                      <span className="text-[10px] opacity-70">{t.type === 'length' ? '總長度' : '總面積'}</span>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold">
                          {t.value.toFixed(2)} <small className="text-[9px]">{t.unit}</small>
                        </div>
                        {t.type === 'area' && getPingValue(t.value, t.unit) && (
                          <div className="text-[9px] opacity-60">
                            ≈ {getPingValue(t.value, t.unit)} 坪
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              {measurements.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-[#141414]/20 rounded-sm">
                  <p className="text-xs opacity-40 italic">尚無測量紀錄</p>
                </div>
              ) : (
                measurements.map((m) => (
                  <div 
                    key={m.id}
                    className={`p-3 border border-[#141414] transition-all cursor-pointer group ${selectedIds.includes(m.id) ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white/40'}`}
                    onClick={() => toggleSelection(m.id)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={m.color} 
                          onChange={(e) => {
                            e.stopPropagation();
                            updateMeasurementColor(m.id, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 p-0 border-none bg-transparent cursor-pointer rounded-full overflow-hidden"
                        />
                        <span className="text-[10px] font-mono uppercase tracking-tighter opacity-70">
                          {m.type === 'length' ? '長度' : '面積'}
                        </span>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); startEditing(m); }}>
                          <Edit3 size={14} className={selectedIds.includes(m.id) ? 'text-[#E4E3E0]' : 'text-[#141414]'} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMeasurement(m.id);
                          }}
                        >
                          <Trash2 size={14} className={selectedIds.includes(m.id) ? 'text-[#E4E3E0]' : 'text-[#141414]'} />
                        </button>
                      </div>
                    </div>
                    
                    {editingId === m.id ? (
                      <div className="flex gap-1 mt-1" onClick={e => e.stopPropagation()}>
                        <input 
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          className="flex-1 bg-white text-[#141414] text-xs px-2 py-1 border border-[#141414]"
                          autoFocus
                        />
                        <button onClick={saveEdit} className="p-1 bg-green-500 text-white">
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-medium">{m.label}</span>
                        <div className="text-right">
                          <div className="text-lg font-mono leading-none">
                            {m.value.toFixed(2)} <small className="text-[10px]">{m.unit}</small>
                          </div>
                          {m.type === 'area' && getPingValue(m.value, m.unit) && (
                            <div className="text-[10px] font-mono opacity-60">
                              ≈ {getPingValue(m.value, m.unit)} 坪
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-[#141414]">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 border border-[#141414] flex items-center justify-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all uppercase text-xs tracking-widest font-bold"
          >
            <Upload size={16} />
            上傳圖片
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageUpload} 
          />
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-[#D1D0CC] overflow-hidden flex items-center justify-center">
        {!imageSrc ? (
          <div className="text-center max-w-md p-8 border border-dashed border-[#141414]/30 rounded-lg">
            <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload size={32} className="opacity-20" />
            </div>
            <h3 className="text-xl font-serif italic mb-2">準備好開始測量了嗎？</h3>
            <p className="text-sm opacity-60 mb-6">上傳建築圖面、地圖或任何帶有已知尺寸的照片。</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-[#141414] text-[#E4E3E0] rounded-sm text-xs uppercase tracking-widest font-bold hover:opacity-90 transition-all"
            >
              選擇圖片
            </button>
          </div>
        ) : (
          <div className="w-full h-full cursor-crosshair">
            <Stage
              width={window.innerWidth - 320}
              height={window.innerHeight}
              scaleX={stageScale}
              scaleY={stageScale}
              x={stagePos.x}
              y={stagePos.y}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              ref={stageRef}
              draggable={tool === 'select'}
            >
              <Layer>
                {image && <KonvaImage image={image} />}
                
                {/* Existing Measurements */}
                {measurements.map((m) => (
                  <Group 
                    key={m.id} 
                    onClick={() => toggleSelection(m.id)}
                    listening={tool === 'select'}
                  >
                    {m.type === 'length' ? (
                      <>
                        <Line
                          points={m.points.flatMap(p => [p.x, p.y])}
                          stroke={selectedIds.includes(m.id) ? '#141414' : m.color}
                          strokeWidth={(selectedIds.includes(m.id) ? 3 : 2) / stageScale}
                        />
                        {m.points.map((p, i) => (
                          <Circle key={i} x={p.x} y={p.y} radius={(selectedIds.includes(m.id) ? 5 : 4) / stageScale} fill={selectedIds.includes(m.id) ? '#141414' : m.color} />
                        ))}
                        <Text
                          x={m.points[0].x}
                          y={m.points[0].y - 20 / stageScale}
                          text={`${m.label}: ${m.value.toFixed(2)} ${m.unit}`}
                          fontSize={14 / stageScale}
                          fontFamily="monospace"
                          fill="#141414"
                          align="center"
                          fontStyle={selectedIds.includes(m.id) ? 'bold' : 'normal'}
                        />
                      </>
                    ) : (
                      <>
                        <Line
                          points={m.points.flatMap(p => [p.x, p.y])}
                          stroke={selectedIds.includes(m.id) ? '#141414' : m.color}
                          strokeWidth={(selectedIds.includes(m.id) ? 3 : 2) / stageScale}
                          fill={m.color + (selectedIds.includes(m.id) ? '66' : '33')}
                          closed
                        />
                        {m.points.map((p, i) => (
                          <Circle key={i} x={p.x} y={p.y} radius={(selectedIds.includes(m.id) ? 5 : 4) / stageScale} fill={selectedIds.includes(m.id) ? '#141414' : m.color} />
                        ))}
                        <Text
                          x={m.points.reduce((acc, p) => acc + p.x, 0) / m.points.length}
                          y={m.points.reduce((acc, p) => acc + p.y, 0) / m.points.length}
                          text={`${m.label}: ${m.value.toFixed(2)} ${m.unit}${m.type === 'area' && getPingValue(m.value, m.unit) ? ` (${getPingValue(m.value, m.unit)} 坪)` : ''}`}
                          fontSize={14 / stageScale}
                          fontFamily="monospace"
                          fill="#141414"
                          align="center"
                          fontStyle={selectedIds.includes(m.id) ? 'bold' : 'normal'}
                        />
                      </>
                    )}
                  </Group>
                ))}

                {/* Drawing Preview */}
                {isDrawing && currentPoints.length > 0 && previewPoint && (
                  <Group>
                    {tool === 'scale' ? (
                      <>
                        <Line
                          points={[currentPoints[0].x, currentPoints[0].y, previewPoint.x, previewPoint.y]}
                          stroke="#ef4444"
                          strokeWidth={2 / stageScale}
                          dash={[5, 5]}
                        />
                        <Circle x={currentPoints[0].x} y={currentPoints[0].y} radius={4 / stageScale} fill="#ef4444" />
                      </>
                    ) : (tool === 'length' || tool === 'area') && (
                      <>
                        <Line
                          points={[...currentPoints.flatMap(p => [p.x, p.y]), previewPoint.x, previewPoint.y]}
                          stroke="#ef4444"
                          strokeWidth={2 / stageScale}
                          dash={[5, 5]}
                          closed={false}
                        />
                        {currentPoints.map((p, i) => (
                          <Circle key={i} x={p.x} y={p.y} radius={4 / stageScale} fill="#ef4444" />
                        ))}
                      </>
                    )}
                  </Group>
                )}
              </Layer>
            </Stage>

            {/* Canvas Controls Overlay */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2">
              <button 
                onClick={() => setStageScale(s => s * 1.2)}
                className="w-10 h-10 bg-white border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <Maximize2 size={18} />
              </button>
              <button 
                onClick={() => setStageScale(s => s / 1.2)}
                className="w-10 h-10 bg-white border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <Minimize2 size={18} />
              </button>
              <button 
                onClick={() => {
                  setStageScale(1);
                  setStagePos({ x: 0, y: 0 });
                }}
                className="w-10 h-10 bg-white border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <History size={18} />
              </button>
            </div>

            {/* Tool Instructions Overlay */}
            <div className="absolute top-6 left-6 pointer-events-none">
              <AnimatePresence mode="wait">
                {tool !== 'select' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-sm text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 shadow-xl"
                  >
                    <Info size={14} />
                    {tool === 'scale' ? '點擊兩點定義已知距離' : 
                     tool === 'length' ? '點擊多點測量長度，點擊最後一點完成' : 
                     '點擊多點繪製面積，點擊第一點閉合'}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Finish/Cancel Buttons for Drawing */}
            {isDrawing && (tool === 'length' || tool === 'area') && currentPoints.length > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
                <button 
                  onClick={cancelDrawing}
                  className="bg-white border border-[#141414] text-[#141414] px-6 py-2 rounded-full flex items-center gap-2 shadow-lg hover:bg-gray-100 transition-all font-bold text-sm"
                >
                  <X size={18} />
                  取消
                </button>
                {((tool === 'length' && currentPoints.length > 1) || (tool === 'area' && currentPoints.length > 2)) && (
                  <button 
                    onClick={finishMeasurement}
                    className="bg-blue-600 text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all font-bold text-sm"
                  >
                    <CheckCircle2 size={18} />
                    完成{tool === 'length' ? '長度' : '面積'}測量
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scale Input Modal */}
      <AnimatePresence>
        {showScaleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#E4E3E0] border border-[#141414] p-8 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-serif italic mb-4">定義比例</h3>
              <p className="text-xs opacity-60 mb-6 leading-relaxed">
                請輸入剛才繪製線段的實際距離。這將作為後續所有測量的基準。
              </p>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-1">實際距離</label>
                    <input 
                      type="number" 
                      value={scaleInput.value}
                      onChange={(e) => setScaleInput({ ...scaleInput, value: e.target.value })}
                      placeholder="例如：5"
                      className="w-full bg-white border border-[#141414] px-3 py-2 font-mono text-lg focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-1">單位</label>
                    <select 
                      value={scaleInput.unit}
                      onChange={(e) => setScaleInput({ ...scaleInput, unit: e.target.value })}
                      className="w-full bg-white border border-[#141414] px-3 py-2 font-mono text-lg focus:outline-none"
                    >
                      <option value="m">m</option>
                      <option value="cm">cm</option>
                      <option value="mm">mm</option>
                      <option value="ft">ft</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => {
                      setShowScaleModal(false);
                      setCurrentPoints([]);
                      setTool('select');
                    }}
                    className="flex-1 py-3 border border-[#141414] text-xs uppercase tracking-widest font-bold hover:bg-white transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={saveScale}
                    disabled={!scaleInput.value}
                    className="flex-1 py-3 bg-[#141414] text-[#E4E3E0] text-xs uppercase tracking-widest font-bold hover:opacity-90 transition-all disabled:opacity-30"
                  >
                    設定比例
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/40 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#E4E3E0] border border-[#141414] p-8 max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowHelpModal(false)}
                className="absolute top-4 right-4 text-[#141414] hover:opacity-50"
              >
                <X size={20} />
              </button>
              
              <h3 className="text-xl font-serif italic mb-6 flex items-center gap-2">
                <Info size={20} /> 使用說明
              </h3>
              
              <div className="space-y-4 text-sm leading-relaxed">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                  <p><b>上傳圖片</b>：點擊左下角按鈕上傳建築圖面或地圖。</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                  <p><b>設定比例</b>：在圖面上找一個已知長度的物件（如比例尺或門寬），畫一條線並輸入實際數值。</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                  <p><b>開始測量</b>：比例設定完成後，即可使用長度或面積工具進行測量。</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-[10px] font-bold shrink-0">4</div>
                  <div className="flex-1">
                    <p><b>操作技巧</b>：</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1 opacity-80">
                      <li><b>滾輪</b>：縮放畫布。</li>
                      <li><b>選取工具</b>：拖拽平移畫布，或點擊測量項目進行編輯。</li>
                      <li><b>長度測量</b>：點擊多點，點擊最後一點或「完成」按鈕結束。</li>
                      <li><b>面積測量</b>：點擊多點，點擊第一點閉合或「完成」按鈕結束。</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowHelpModal(false)}
                className="w-full mt-8 py-3 bg-[#141414] text-[#E4E3E0] text-xs uppercase tracking-widest font-bold hover:opacity-90 transition-all"
              >
                我知道了
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label, disabled = false }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-2 p-4 border transition-all
        ${disabled ? 'opacity-20 cursor-not-allowed grayscale' : 'cursor-pointer'}
        ${active ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'bg-white/40 border-[#141414] hover:bg-white/80'}
      `}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-widest font-bold">{label}</span>
    </button>
  );
}
