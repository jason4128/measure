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
  CheckCircle2,
  Sparkles,
  Layers,
  FilePlus,
  Clipboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { Tool, Point, Measurement, Scale, ProjectPage, Wall, Door } from './types';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjs from 'pdfjs-dist';
import { ThreeDViewer } from './components/ThreeDViewer';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

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

const getPolygonPerimeter = (points: Point[]) => {
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perimeter += Math.sqrt(Math.pow(points[j].x - points[i].x, 2) + Math.pow(points[j].y - points[i].y, 2));
  }
  return perimeter;
};

// 1 Ping = 3.305785 m2
const M2_TO_PING = 0.3025;

// 產生唯一的 ID，結合時間戳記與隨機字串以避免碰撞
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export default function App() {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [tool, setTool] = useState<Tool>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [tempPixelDist, setTempPixelDist] = useState(0);
  const [scaleInput, setScaleInput] = useState({ value: '', unit: 'm' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detectRoom, setDetectRoom] = useState(true);
  const [detectCorridor, setDetectCorridor] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [lengthColor, setLengthColor] = useState('#3b82f6');
  const [areaColor, setAreaColor] = useState('#10b981');
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('GEMINI_CUSTOM_API_KEY') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [globalHeight, setGlobalHeight] = useState<string>('2.8'); // Default global height
  const [isEditingScale, setIsEditingScale] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'info';
  }>({ show: false, title: '', message: '', onConfirm: () => {} });
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    title: string;
    message: string;
  }>({ show: false, title: '', message: '' });

  const updateCurrentPage = useCallback((updates: Partial<ProjectPage> | ((prev: ProjectPage) => Partial<ProjectPage>)) => {
    if (!currentPageId) return;
    setPages(prevPages => prevPages.map(p => {
      if (p.id === currentPageId) {
        const resolvedUpdates = typeof updates === 'function' ? updates(p) : updates;
        return { ...p, ...resolvedUpdates };
      }
      return p;
    }));
  }, [currentPageId]);

  const currentPage = pages.find(p => p.id === currentPageId);
  const [image] = useImage(currentPage?.imageSrc || '');

  const stageRef = useRef<any>(null);
  const dragStartPoints = useRef<Point[] | null>(null);
  const dragStartPointer = useRef<Point | null>(null);
  const lastPointerPos = useRef<Point | null>(null); // 保留用於其他可能的增量需求
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('GEMINI_CUSTOM_API_KEY', customApiKey);
    if (customApiKey) setHasApiKey(true);
  }, [customApiKey]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (process.env.GEMINI_API_KEY || customApiKey) {
        setHasApiKey(true);
        return;
      }
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();
  }, [customApiKey]);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      if (e.key === 'Escape') {
        setCurrentPoints([]);
        setIsDrawing(false);
        setSelectedIds([]);
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0 && currentPage) {
          const newMeasurements = currentPage.measurements.filter(m => !selectedIds.includes(m.id));
          const newWalls = currentPage.walls.filter(w => !selectedIds.includes(w.id));
          const newDoors = currentPage.doors.filter(d => !selectedIds.includes(d.id));
          updateCurrentPage({ 
            measurements: newMeasurements,
            walls: newWalls,
            doors: newDoors
          });
          setSelectedIds([]);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        setIsMiddleMouseDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [selectedIds, currentPage, updateCurrentPage]);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(async (file) => {
      processFile(file);
    });
  };

  const processFile = async (file: File) => {
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context!, viewport, canvas: canvas as any }).promise;
          const imageSrc = canvas.toDataURL();
          
          const newPage: ProjectPage = {
            id: generateId(),
            name: pdf.numPages > 1 ? `${file.name} (第 ${i} 頁)` : file.name,
            imageSrc,
            scale: null,
            measurements: [],
            walls: [],
            doors: [],
            stageScale: 1,
            stagePos: { x: 0, y: 0 }
          };
          
          setPages(prev => {
            const newPages = [...prev, newPage];
            if (newPages.length === 1) {
              setCurrentPageId(newPage.id);
            }
            return newPages;
          });
        }
      } catch (error) {
        console.error("PDF Error:", error);
        setErrorModal({
          show: true,
          title: '讀取失敗',
          message: '讀取 PDF 失敗，請檢查檔案是否損壞。'
        });
      }
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const newPage: ProjectPage = {
          id: generateId(),
          name: file.name || `貼上圖片 ${new Date().toLocaleTimeString()}`,
          imageSrc: reader.result as string,
          scale: null,
          measurements: [],
          walls: [],
          doors: [],
          stageScale: 1,
          stagePos: { x: 0, y: 0 }
        };
        setPages(prev => {
          const newPages = [...prev, newPage];
          if (newPages.length === 1) {
            setCurrentPageId(newPage.id);
          }
          return newPages;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle clipboard paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            processFile(blob);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const removePage = (id: string) => {
    if (pages.length <= 1) {
      setPages([]);
      setCurrentPageId(null);
      return;
    }
    const newPages = pages.filter(p => p.id !== id);
    setPages(newPages);
    if (currentPageId === id) {
      setCurrentPageId(newPages[0].id);
    }
  };

  // Handle stage mouse events
  const handleMouseDown = (e: any) => {
    if (e.evt.button === 1) {
      setIsMiddleMouseDown(true);
      return;
    }
    if (isSpacePressed) {
      return;
    }
    if (!currentPage) return;
    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();

    if (tool === 'select') {
      if (e.target === stage) {
        setSelectedIds([]);
      }
      return;
    }

    if (tool === 'wall' || tool === 'door') {
      if (!isDrawing) {
        setCurrentPoints([point]);
        setIsDrawing(true);
      } else {
        const points = [currentPoints[0], point];
        finishWallOrDoor(points);
      }
    } else if (tool === 'scale') {
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
        const lastPoint = currentPoints[currentPoints.length - 1];
        const distToLast = getDistance(point, lastPoint);
        
        if (distToLast < 10 / currentPage.stageScale && currentPoints.length > 1) {
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
        const firstPoint = currentPoints[0];
        const distToFirst = getDistance(point, firstPoint);
        
        if (distToFirst < 10 / currentPage.stageScale && currentPoints.length > 2) {
          finishMeasurement();
        } else {
          setCurrentPoints([...currentPoints, point]);
        }
      }
    } else if (tool === 'rect') {
      if (!isDrawing) {
        setCurrentPoints([point]);
        setIsDrawing(true);
      } else {
        const p1 = currentPoints[0];
        const p2 = point;
        // Create 4 points for the rectangle
        const rectPoints = [
          { x: p1.x, y: p1.y },
          { x: p2.x, y: p1.y },
          { x: p2.x, y: p2.y },
          { x: p1.x, y: p2.y }
        ];
        setCurrentPoints(rectPoints);
        finishMeasurement(rectPoints);
      }
    }
  };

  const finishWallOrDoor = (points: Point[]) => {
    if (!currentPage || points.length < 2) return;
    const { walls, doors, scale } = currentPage;

    if (tool === 'wall') {
      const newWall: Wall = {
        id: generateId(),
        points,
        thickness: 0.2,
        height: parseFloat(globalHeight) || 2.8,
        color: '#94a3b8',
        label: `牆面 ${walls.length + 1}`
      };
      updateCurrentPage({ walls: [...walls, newWall] });
    } else if (tool === 'door') {
      const newDoor: Door = {
        id: generateId(),
        points,
        width: scale ? (getDistance(points[0], points[1]) / scale.pixelDistance) * scale.realDistance : 0.9,
        label: `門 ${doors.length + 1}`
      };
      updateCurrentPage({ doors: [...doors, newDoor] });
    }
    setCurrentPoints([]);
    setIsDrawing(false);
  };

  const finishMeasurement = (pointsOverride?: Point[]) => {
    const pointsToUse = pointsOverride || currentPoints;
    if (!currentPage?.scale || pointsToUse.length < 2) return;
    const { scale, measurements } = currentPage;

    if (tool === 'length') {
      const pixelDist = getPathLength(pointsToUse);
      const realDist = (pixelDist / scale.pixelDistance) * scale.realDistance;
      const newMeasurement: Measurement = {
        id: generateId(),
        type: 'length',
        points: pointsToUse,
        value: realDist,
        unit: scale.unit,
        label: `長度測量 ${measurements.length + 1}`,
        color: lengthColor
      };
      updateCurrentPage({ measurements: [...measurements, newMeasurement] });
    } else if (tool === 'area' || tool === 'rect') {
      if (pointsToUse.length < 3) return;
      const pixelArea = getPolygonArea(pointsToUse);
      const pixelPerimeter = getPolygonPerimeter(pointsToUse);
      const realArea = pixelArea * Math.pow(scale.realDistance / scale.pixelDistance, 2);
      const realPerimeter = pixelPerimeter * (scale.realDistance / scale.pixelDistance);
      const newMeasurement: Measurement = {
        id: generateId(),
        type: 'area',
        points: pointsToUse,
        value: realArea,
        perimeter: realPerimeter,
        unit: `${scale.unit}²`,
        label: `${tool === 'rect' ? '矩形' : '面積'}測量 ${measurements.length + 1}`,
        color: areaColor,
        isRect: tool === 'rect'
      };
      updateCurrentPage({ measurements: [...measurements, newMeasurement] });
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
    if (!currentPage) return;
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
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    updateCurrentPage({ stageScale: newScale, stagePos: newPos });
  };

  const saveScale = () => {
    const realDist = parseFloat(scaleInput.value);
    if (!isNaN(realDist) && realDist > 0) {
      const newScale = {
        pixelDistance: tempPixelDist,
        realDistance: realDist,
        unit: scaleInput.unit
      };

      if (isEditingScale) {
        setPages(prevPages => prevPages.map(p => {
          if (p.id === currentPageId) {
            return recalculatePageMeasurements(p, newScale);
          }
          return p;
        }));
      } else {
        updateCurrentPage({ scale: newScale });
      }

      setShowScaleModal(false);
      setIsEditingScale(false);
      setTool('select');
      setCurrentPoints([]);
    }
  };

  const deleteMeasurement = (id: string) => {
    if (!currentPage) return;
    updateCurrentPage({
      measurements: currentPage.measurements.filter(m => m.id !== id),
      walls: currentPage.walls.filter(w => w.id !== id),
      doors: currentPage.doors.filter(d => d.id !== id)
    });
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
    setEditHeight(m.height?.toString() || '');
  };

  const updateMeasurementColor = (id: string, color: string) => {
    updateCurrentPage({
      measurements: currentPage.measurements.map(m => 
        m.id === id ? { ...m, color } : m
      )
    });
  };

  const saveEdit = () => {
    if (editingId && currentPage) {
      const heightVal = parseFloat(editHeight);
      updateCurrentPage({
        measurements: currentPage.measurements.map(m => {
          if (m.id === editingId) {
            const updated = { ...m, label: editLabel, height: isNaN(heightVal) ? undefined : heightVal };
            if (updated.type === 'area' && updated.perimeter && updated.height) {
              updated.wallArea = updated.perimeter * updated.height;
            }
            return updated;
          }
          return m;
        })
      });
      setEditingId(null);
    }
  };

  const applyGlobalHeight = (heightStr: string) => {
    const h = parseFloat(heightStr);
    setGlobalHeight(heightStr);
    if (!currentPage || isNaN(h)) return;

    updateCurrentPage({
      measurements: currentPage.measurements.map(m => {
        if (m.type === 'area') {
          const updated = { ...m, height: h };
          if (updated.perimeter) {
            updated.wallArea = updated.perimeter * h;
          }
          return updated;
        }
        return m;
      })
    });
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

  const recalculatePageMeasurements = (page: ProjectPage, newScale: Scale): ProjectPage => {
    const { pixelDistance, realDistance, unit } = newScale;
    const scaleFactor = realDistance / pixelDistance;
    const areaScaleFactor = Math.pow(scaleFactor, 2);

    return {
      ...page,
      scale: newScale,
      measurements: page.measurements.map(m => {
        if (m.type === 'length') {
          const pixelDist = getPathLength(m.points);
          return {
            ...m,
            value: pixelDist * scaleFactor,
            unit: unit
          };
        } else if (m.type === 'area') {
          const pixelArea = getPolygonArea(m.points);
          const pixelPerimeter = getPolygonPerimeter(m.points);
          const realArea = pixelArea * areaScaleFactor;
          const realPerimeter = pixelPerimeter * scaleFactor;
          const wallArea = m.height ? realPerimeter * m.height : undefined;
          return {
            ...m,
            value: realArea,
            perimeter: realPerimeter,
            wallArea: wallArea,
            unit: `${unit}²`
          };
        }
        return m;
      })
    };
  };

  const downloadCSV = () => {
    if (!currentPage || currentPage.measurements.length === 0) return;
    
    const headers = ['名稱', '類型', '數值', '單位', '坪數 (面積)', '周長', '高度', '牆面積', '牆面積 (坪)'];
    const rows = currentPage.measurements.map(m => [
      m.label,
      m.type === 'length' ? '長度' : '面積',
      m.value.toFixed(2),
      m.unit,
      m.type === 'area' ? getPingValue(m.value, m.unit) || '-' : '-',
      m.perimeter ? m.perimeter.toFixed(2) : '-',
      m.height ? m.height.toFixed(2) : '-',
      m.wallArea ? m.wallArea.toFixed(2) : '-',
      m.wallArea ? getPingValue(m.wallArea, m.unit) || '-' : '-'
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `測量數據_${currentPage.name}_${new Date().toLocaleDateString()}.csv`);
    link.click();
  };

  const saveProject = () => {
    if (pages.length === 0) return;
    const projectData = {
      pages,
      currentPageId,
      version: '2.0'
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
          if (data.version === '2.0') {
            setPages(data.pages);
            setCurrentPageId(data.currentPageId);
          } else {
            // Legacy support
            const legacyPage: ProjectPage = {
              id: generateId(),
              name: '匯入專案',
              imageSrc: data.imageSrc,
              scale: data.scale,
              measurements: data.measurements,
              walls: data.walls || [],
              doors: data.doors || [],
              stageScale: data.stageScale || 1,
              stagePos: data.stagePos || { x: 0, y: 0 }
            };
            setPages([legacyPage]);
            setCurrentPageId(legacyPage.id);
          }
          setSelectedIds([]);
          setTool('select');
        } catch (err) {
          setErrorModal({
            show: true,
            title: '讀取失敗',
            message: '讀取專案檔案失敗，請確保檔案格式正確。'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const detectRoomsWithAI = async () => {
    if (!currentPage || !image) return;

    // 檢查金鑰
    if (!hasApiKey && !process.env.GEMINI_API_KEY && !customApiKey) {
      setShowApiKeyInput(true);
      return;
    }

    setIsAiProcessing(true);
    try {
      // 優先級：手動輸入 > 環境變數 > 官方金鑰
      const apiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      
      if (!apiKey) {
        throw new Error('API Key is missing. Please provide a valid API key.');
      }

      if (!detectRoom && !detectCorridor) {
        alert('請至少勾選房間或走廊其中一項。');
        setIsAiProcessing(false);
        return;
      }

      const aiInstance = new GoogleGenAI({ apiKey });
      
      const base64Data = currentPage.imageSrc.split(',')[1];
      const targetTypes = [];
      if (detectRoom) targetTypes.push("房間 (Rooms)");
      if (detectCorridor) targetTypes.push("走廊 (Corridors)");
      
      const prompt = `這是一張建築平面圖。請識別圖中所有的 ${targetTypes.join('、')}。
      請以 JSON 格式返回一個數組，每個對象包含：
      - "label": 區域名稱 (例如：客廳, 臥室, 廚房, 走廊)
      - "bbox": 區域的矩形邊界框，格式為 [ymin, xmin, ymax, xmax]。坐標應為歸一化坐標 (0-1000)。
      請確保返回的是矩形區域，以便用戶後續調整。`;

      const response = await aiInstance.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                bbox: { 
                  type: Type.ARRAY, 
                  items: { type: Type.NUMBER },
                  description: "[ymin, xmin, ymax, xmax]"
                }
              },
              required: ["label", "bbox"]
            }
          }
        }
      });

      const detectedRooms = JSON.parse(response.text);
      if (!image) return;
      
      const imgWidth = image.width;
      const imgHeight = image.height;

      const newMeasurements: Measurement[] = detectedRooms.map((room: any) => {
        const [ymin, xmin, ymax, xmax] = room.bbox;
        
        // 轉換為矩形的 4 個頂點
        const points = [
          { x: (xmin / 1000) * imgWidth, y: (ymin / 1000) * imgHeight }, // Top-left
          { x: (xmax / 1000) * imgWidth, y: (ymin / 1000) * imgHeight }, // Top-right
          { x: (xmax / 1000) * imgWidth, y: (ymax / 1000) * imgHeight }, // Bottom-right
          { x: (xmin / 1000) * imgWidth, y: (ymax / 1000) * imgHeight }  // Bottom-left
        ];

        let value = 0;
        let perimeter = 0;
        let unit = 'px²';
        if (currentPage.scale) {
          const pixelArea = getPolygonArea(points);
          const pixelPerimeter = getPolygonPerimeter(points);
          value = pixelArea * Math.pow(currentPage.scale.realDistance / currentPage.scale.pixelDistance, 2);
          perimeter = pixelPerimeter * (currentPage.scale.realDistance / currentPage.scale.pixelDistance);
          unit = `${currentPage.scale.unit}²`;
        }

        const isCorridor = room.label.includes('走廊') || room.label.toLowerCase().includes('corridor');
        const h = parseFloat(globalHeight);

        return {
          id: generateId(),
          type: 'area',
          points,
          value,
          perimeter,
          unit,
          label: room.label.replace(/^AI 偵測: /, ''), // 移除 "AI 偵測: " 前綴
          color: isCorridor ? '#f59e0b' : areaColor, // 區分走廊與房間顏色
          isRect: true,
          height: isNaN(h) ? undefined : h,
          wallArea: (!isNaN(h) && perimeter) ? perimeter * h : undefined
        };
      });

      updateCurrentPage({ measurements: [...currentPage.measurements, ...newMeasurements] });
    } catch (error) {
      console.error("AI Detection Error:", error);
      setErrorModal({
        show: true,
        title: 'AI 偵測失敗',
        message: 'AI 偵測失敗，請稍後再試。'
      });
    } finally {
      setIsAiProcessing(false);
    }
  };

  const detectWallsAndDoorsWithAI = async () => {
    if (!currentPage || !image) return;

    if (!hasApiKey && !process.env.GEMINI_API_KEY && !customApiKey) {
      setShowApiKeyInput(true);
      return;
    }

    setIsAiProcessing(true);
    try {
      const apiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const aiInstance = new GoogleGenAI({ apiKey });
      const base64Data = currentPage.imageSrc.split(',')[1];
      
      const prompt = `這是一張建築平面圖。請識別圖中所有的牆 (Walls) 和門 (Doors)。
      請以 JSON 格式返回一個數組，每個對象包含：
      - "type": "wall" 或 "door"
      - "label": 名稱
      - "points": 線段的兩個端點，格式為 [[y1, x1], [y2, x2]]。坐標應為歸一化坐標 (0-1000)。
      請儘可能精確地描繪牆的中心線。`;

      const response = await aiInstance.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["wall", "door"] },
                label: { type: Type.STRING },
                points: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER }
                  },
                  description: "[[y1, x1], [y2, x2]]"
                }
              },
              required: ["type", "label", "points"]
            }
          }
        }
      });

      const detected = JSON.parse(response.text);
      const imgWidth = image.width;
      const imgHeight = image.height;

      const newWalls: Wall[] = [];
      const newDoors: Door[] = [];

      detected.forEach((item: any) => {
        const points = item.points.map((p: number[]) => ({
          x: (p[1] / 1000) * imgWidth,
          y: (p[0] / 1000) * imgHeight
        }));

        if (item.type === 'wall') {
          newWalls.push({
            id: generateId(),
            points,
            thickness: 0.2,
            height: parseFloat(globalHeight) || 2.8,
            color: '#94a3b8',
            label: item.label
          });
        } else {
          newDoors.push({
            id: generateId(),
            points,
            width: currentPage.scale ? (getDistance(points[0], points[1]) / currentPage.scale.pixelDistance) * currentPage.scale.realDistance : 0.9,
            label: item.label
          });
        }
      });

      updateCurrentPage({ 
        walls: [...currentPage.walls, ...newWalls],
        doors: [...currentPage.doors, ...newDoors]
      });
    } catch (error) {
      console.error("AI Wall Detection Error:", error);
      setErrorModal({
        show: true,
        title: 'AI 偵測失敗',
        message: 'AI 偵測牆面與門失敗，請稍後再試。'
      });
    } finally {
      setIsAiProcessing(false);
    }
  };

  const getTotals = () => {
    if (!currentPage) return null;
    const selectedItems = currentPage.measurements.filter(m => selectedIds.includes(m.id));
    if (selectedItems.length === 0) return null;

    const totals: { [key: string]: { value: number, unit: string, type: string, wallArea: number } } = {};
    
    selectedItems.forEach(m => {
      const key = `${m.type}-${m.unit}`;
      if (!totals[key]) {
        totals[key] = { value: 0, unit: m.unit, type: m.type, wallArea: 0 };
      }
      totals[key].value += m.value;
      if (m.wallArea) {
        totals[key].wallArea += m.wallArea;
      }
    });

    return Object.values(totals);
  };

  const handlePointDragMove = useCallback((measurementId: string, pointIndex: number, e: any) => {
    e.cancelBubble = true; // 阻止事件冒泡到畫布
    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();
    
    if (!point) return;

    // 同步節點座標，防止雙重位移
    e.target.x(point.x);
    e.target.y(point.y);

    updateCurrentPage(prevPage => {
      if (!prevPage.scale) return {};
      
      const newWalls = prevPage.walls.map(w => {
        if (w.id === measurementId) {
          const newPoints = [...w.points];
          newPoints[pointIndex] = point;
          return { ...w, points: newPoints };
        }
        return w;
      });

      const newDoors = prevPage.doors.map(d => {
        if (d.id === measurementId) {
          const newPoints = [...d.points];
          newPoints[pointIndex] = point;
          return { ...d, points: newPoints };
        }
        return d;
      });

      const newMeasurements = prevPage.measurements.map(m => {
        if (m.id === measurementId) {
          const newPoints = [...m.points];
          newPoints[pointIndex] = point;
          
          // Handle rectangle constraints if it's a rectangle
          if (m.isRect && newPoints.length === 4) {
            if (pointIndex === 0) { // Top-left
              newPoints[1] = { ...newPoints[1], y: point.y };
              newPoints[3] = { ...newPoints[3], x: point.x };
            } else if (pointIndex === 1) { // Top-right
              newPoints[0] = { ...newPoints[0], y: point.y };
              newPoints[2] = { ...newPoints[2], x: point.x };
            } else if (pointIndex === 2) { // Bottom-right
              newPoints[1] = { ...newPoints[1], x: point.x };
              newPoints[3] = { ...newPoints[3], y: point.y };
            } else if (pointIndex === 3) { // Bottom-left
              newPoints[0] = { ...newPoints[0], x: point.x };
              newPoints[2] = { ...newPoints[2], y: point.y };
            }
          }
          
          let newValue = m.value;
          let newPerimeter = m.perimeter;
          let newWallArea = m.wallArea;

          if (m.type === 'length') {
            const pixelDist = getPathLength(newPoints);
            newValue = (pixelDist / prevPage.scale!.pixelDistance) * prevPage.scale!.realDistance;
          } else if (m.type === 'area') {
            const pixelArea = getPolygonArea(newPoints);
            const pixelPerimeter = getPolygonPerimeter(newPoints);
            newValue = pixelArea * Math.pow(prevPage.scale!.realDistance / prevPage.scale!.pixelDistance, 2);
            newPerimeter = pixelPerimeter * (prevPage.scale!.realDistance / prevPage.scale!.pixelDistance);
            if (m.height) {
              newWallArea = newPerimeter * m.height;
            }
          }
          
          return { ...m, points: newPoints, value: newValue, perimeter: newPerimeter, wallArea: newWallArea };
        }
        return m;
      });
      
      return { measurements: newMeasurements, walls: newWalls, doors: newDoors };
    });
  }, [updateCurrentPage]);

  const handleMeasurementDragStart = (measurementId: string, e: any) => {
    e.cancelBubble = true; // 阻止事件冒泡到畫布
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    dragStartPointer.current = pos;

    // 找到當前拖拽的測量對象並記錄其初始頂點
    const measurement = currentPage.measurements.find(m => m.id === measurementId);
    const wall = currentPage.walls.find(w => w.id === measurementId);
    const door = currentPage.doors.find(d => d.id === measurementId);
    
    if (measurement) {
      dragStartPoints.current = [...measurement.points];
    } else if (wall) {
      dragStartPoints.current = [...wall.points];
    } else if (door) {
      dragStartPoints.current = [...door.points];
    }
  };

  const handleMeasurementDragMove = useCallback((measurementId: string, e: any) => {
    e.cancelBubble = true; // 阻止事件冒泡到畫布
    const stage = e.target.getStage();
    const currentPointerPos = stage.getRelativePointerPosition();
    
    if (!dragStartPointer.current || !currentPointerPos || !dragStartPoints.current) return;

    // 計算滑鼠相對於「拖拽起點」的總位移
    const dx = currentPointerPos.x - dragStartPointer.current.x;
    const dy = currentPointerPos.y - dragStartPointer.current.y;

    // 重置 Konva 節點的本地座標，因為我們是直接更新 state 中的 points
    e.target.x(0);
    e.target.y(0);

    updateCurrentPage(prevPage => {
      const newWalls = prevPage.walls.map(w => {
        if (w.id === measurementId) {
          const startPoints = dragStartPoints.current!;
          const newPoints = startPoints.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          return { ...w, points: newPoints };
        }
        return w;
      });

      const newDoors = prevPage.doors.map(d => {
        if (d.id === measurementId) {
          const startPoints = dragStartPoints.current!;
          const newPoints = startPoints.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          return { ...d, points: newPoints };
        }
        return d;
      });

      const newMeasurements = prevPage.measurements.map(m => {
        if (m.id === measurementId) {
          // 基於初始頂點座標加上總位移，確保絕對精確
          const newPoints = dragStartPoints.current!.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          
          let newValue = m.value;
          let newPerimeter = m.perimeter;
          let newWallArea = m.wallArea;

          if (prevPage.scale) {
            if (m.type === 'length') {
              const pixelDist = getPathLength(newPoints);
              newValue = (pixelDist / prevPage.scale.pixelDistance) * prevPage.scale.realDistance;
            } else if (m.type === 'area') {
              const pixelArea = getPolygonArea(newPoints);
              const pixelPerimeter = getPolygonPerimeter(newPoints);
              newValue = pixelArea * Math.pow(prevPage.scale.realDistance / prevPage.scale.pixelDistance, 2);
              newPerimeter = pixelPerimeter * (prevPage.scale.realDistance / prevPage.scale.pixelDistance);
              if (m.height) {
                newWallArea = newPerimeter * m.height;
              }
            }
          }

          return { ...m, points: newPoints, value: newValue, perimeter: newPerimeter, wallArea: newWallArea };
        }
        return m;
      });
      return { measurements: newMeasurements, walls: newWalls, doors: newDoors };
    });
  }, [updateCurrentPage]);

  const totals = getTotals();

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-[#141414] flex flex-col bg-[#E4E3E0] z-10">
        <div className="p-6 border-bottom border-[#141414]">
          <h1 className="text-2xl font-serif italic mb-2">工程平面圖系統</h1>
          <p className="text-xs opacity-60 uppercase tracking-widest">專業影像測量與標註</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Pages Section */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider">圖面列表</h2>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      navigator.clipboard.read().then(items => {
                        for (const item of items) {
                          for (const type of item.types) {
                            if (type.startsWith('image/')) {
                              item.getType(type).then(blob => {
                                const file = new File([blob], `剪貼簿圖片_${new Date().toLocaleTimeString()}.png`, { type });
                                processFile(file);
                              });
                            }
                          }
                        }
                      }).catch(err => {
                        console.error('Clipboard error:', err);
                        alert('無法讀取剪貼簿，請確保已授權權限或直接使用 Ctrl+V 貼上。');
                      });
                    }}
                    className="p-1 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all rounded-sm"
                    title="從剪貼簿貼上"
                  >
                    <Clipboard size={16} />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all rounded-sm"
                    title="新增圖面"
                  >
                    <FilePlus size={16} />
                  </button>
                </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] opacity-40 italic mb-2">提示：可直接 Ctrl+V 貼上圖片</p>
              {pages.length === 0 ? (
                <p className="text-[10px] opacity-40 italic text-center py-2">尚未上傳圖面</p>
              ) : (
                pages.map(p => (
                  <div 
                    key={p.id}
                    className={`group flex items-center justify-between p-2 border transition-all cursor-pointer ${currentPageId === p.id ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-transparent hover:border-[#141414]/20'}`}
                    onClick={() => setCurrentPageId(p.id)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Layers size={14} className="shrink-0 opacity-50" />
                      <span className="text-[11px] truncate font-medium">{p.name}</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmModal({
                          show: true,
                          title: '刪除圖面',
                          message: `確定要刪除「${p.name}」嗎？此動作無法復原。`,
                          type: 'danger',
                          onConfirm: () => removePage(p.id)
                        });
                      }}
                      className={`opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all ${currentPageId === p.id ? 'text-[#E4E3E0]' : 'text-[#141414]'}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

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
                disabled={!currentPage}
              />
              <ToolButton 
                active={tool === 'length'} 
                onClick={() => {
                  setTool('length');
                  setCurrentPoints([]);
                  setIsDrawing(false);
                }} 
                icon={<Ruler size={18} />} 
                label="長度測量" 
                disabled={!currentPage?.scale}
              />
              <ToolButton 
                active={tool === 'area'} 
                onClick={() => {
                  setTool('area');
                  setCurrentPoints([]);
                  setIsDrawing(false);
                }} 
                icon={<Square size={18} />} 
                label="面積測量" 
                disabled={!currentPage?.scale}
              />
              <ToolButton 
                active={tool === 'wall'} 
                onClick={() => {
                  setTool('wall');
                  setCurrentPoints([]);
                  setIsDrawing(false);
                }} 
                icon={<Edit3 size={18} />} 
                label="繪製牆面" 
                disabled={!currentPage?.scale}
              />
              <ToolButton 
                active={tool === 'door'} 
                onClick={() => {
                  setTool('door');
                  setCurrentPoints([]);
                  setIsDrawing(false);
                }} 
                icon={<CheckCircle2 size={18} />} 
                label="繪製門" 
                disabled={!currentPage?.scale}
              />
            </div>
          </section>

          {/* Global Settings */}
          <section className="p-4 border border-[#141414] bg-white/40">
            <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider mb-3">全域設定</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-widest font-bold">預設天花板高度</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number"
                    step="0.1"
                    value={globalHeight}
                    onChange={(e) => applyGlobalHeight(e.target.value)}
                    className="w-16 bg-white border border-[#141414] px-2 py-1 text-xs font-mono focus:outline-none"
                  />
                  <span className="text-[10px] opacity-60">{currentPage?.scale?.unit || 'm'}</span>
                </div>
              </div>
              <p className="text-[8px] opacity-40 leading-tight">
                * 修改此處將同步更新所有測量項目的牆面積計算。
              </p>
            </div>
          </section>

          {/* AI Tools */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[11px] font-serif italic opacity-50 uppercase tracking-wider">AI 輔助</h2>
              <button 
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className={`p-1 transition-all rounded-sm ${customApiKey ? 'text-green-600' : 'text-blue-600'}`}
                title="設定 API 金鑰"
              >
                <Settings size={14} />
              </button>
            </div>

            <AnimatePresence>
              {showApiKeyInput && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="p-3 border border-blue-200 bg-blue-50/50 rounded-sm space-y-2">
                    <label className="text-[9px] uppercase tracking-widest font-bold text-blue-800">手動輸入 Gemini API 金鑰</label>
                    <div className="flex gap-1">
                      <input 
                        type="password"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        placeholder="在此貼入 AIzaSy..."
                        className="flex-1 bg-white border border-blue-300 px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-blue-500"
                      />
                      {customApiKey && (
                        <button 
                          onClick={() => { setCustomApiKey(''); localStorage.removeItem('GEMINI_CUSTOM_API_KEY'); }}
                          className="p-1 text-red-500 hover:bg-red-50"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <div className="flex gap-2 mb-3">
                <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                  <input type="checkbox" checked={detectRoom} onChange={(e) => setDetectRoom(e.target.checked)} />
                  房間
                </label>
                <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                  <input type="checkbox" checked={detectCorridor} onChange={(e) => setDetectCorridor(e.target.checked)} />
                  走廊
                </label>
              </div>
              
              <button 
                onClick={detectRoomsWithAI}
                disabled={!currentPage || isAiProcessing}
                className={`w-full p-3 border border-[#141414] flex items-center justify-center gap-2 transition-all relative overflow-hidden ${isAiProcessing ? 'bg-gray-100 cursor-wait' : 'bg-white/40 hover:bg-white/80'}`}
              >
                <Sparkles size={16} />
                <span className="text-[10px] uppercase tracking-widest font-bold">自動偵測房間面積</span>
              </button>

              <button 
                onClick={detectWallsAndDoorsWithAI}
                disabled={!currentPage || isAiProcessing}
                className={`w-full p-3 border border-[#141414] flex items-center justify-center gap-2 transition-all relative overflow-hidden ${isAiProcessing ? 'bg-gray-100 cursor-wait' : 'bg-white/40 hover:bg-white/80'}`}
              >
                <Layers size={16} />
                <span className="text-[10px] uppercase tracking-widest font-bold">自動偵測牆面與門</span>
              </button>
            </div>
          </section>

          {/* Scale Info */}
          {currentPage?.scale && (
            <section className="p-3 border border-[#141414] rounded-sm bg-white/50">
              <div className="flex justify-between items-start mb-1">
                <h2 className="text-[10px] font-mono uppercase tracking-tighter opacity-50">目前比例尺</h2>
                <button 
                  onClick={() => {
                    setScaleInput({
                      value: currentPage.scale!.realDistance.toString(),
                      unit: currentPage.scale!.unit
                    });
                    setTempPixelDist(currentPage.scale!.pixelDistance);
                    setIsEditingScale(true);
                    setShowScaleModal(true);
                  }}
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Edit3 size={10} />
                  修改單位
                </button>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-lg font-mono">{currentPage.scale.realDistance} {currentPage.scale.unit}</span>
                <span className="text-[10px] opacity-50 font-mono">≈ {Math.round(currentPage.scale.pixelDistance)} 像素</span>
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
                disabled={pages.length === 0}
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
                <span className="text-[10px] font-mono opacity-40">{currentPage?.measurements.length || 0} 筆</span>
                {currentPage && currentPage.measurements.length > 0 && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const areaIds = currentPage.measurements.filter(m => m.type === 'area').map(m => m.id);
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
                        const lengthIds = currentPage.measurements.filter(m => m.type === 'length').map(m => m.id);
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
                        if (selectedIds.length === currentPage.measurements.length) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(currentPage.measurements.map(m => m.id));
                        }
                      }}
                      className="text-[10px] text-gray-500 hover:underline"
                    >
                      {selectedIds.length === currentPage.measurements.length ? '取消全選' : '全選全部'}
                    </button>
                    <button 
                      onClick={downloadCSV}
                      className="text-[10px] text-gray-500 hover:underline flex items-center gap-1"
                    >
                      <Download size={10} /> 匯出
                    </button>
                    <button 
                      onClick={() => {
                        setConfirmModal({
                          show: true,
                          title: '刪除所有紀錄',
                          message: '確定要刪除此圖面的所有測量紀錄嗎？',
                          type: 'danger',
                          onConfirm: () => {
                            updateCurrentPage({ measurements: [], walls: [], doors: [] });
                            setSelectedIds([]);
                          }
                        });
                      }}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      全部刪除
                    </button>
                    <button 
                      onClick={() => {
                        setConfirmModal({
                          show: true,
                          title: '一鍵清除',
                          message: '確定要清空此圖面的所有數據嗎？（包含比例尺）',
                          type: 'danger',
                          onConfirm: () => {
                            updateCurrentPage({ measurements: [], walls: [], doors: [], scale: null });
                            setSelectedIds([]);
                          }
                        });
                      }}
                      className="text-[10px] text-red-700 font-bold hover:underline"
                    >
                      一鍵清除
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
                  {totals.map((t) => (
                    <div key={`${t.type}-${t.unit}`} className="flex flex-col border-b border-white/10 pb-2 last:border-0">
                      <div className="flex justify-between items-end">
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
                      {t.type === 'area' && t.wallArea > 0 && (
                        <div className="flex justify-between items-end mt-1">
                          <span className="text-[10px] opacity-70">總牆面積</span>
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold text-blue-400">
                              {t.wallArea.toFixed(2)} <small className="text-[9px]">{t.unit}</small>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              {!currentPage || currentPage.measurements.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-[#141414]/20 rounded-sm">
                  <p className="text-xs opacity-40 italic">尚無測量紀錄</p>
                </div>
              ) : (
                currentPage.measurements.map((m) => (
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
                      <div className="space-y-2 mt-1" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <input 
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            className="flex-1 bg-white text-[#141414] text-xs px-2 py-1 border border-[#141414]"
                            placeholder="名稱"
                            autoFocus
                          />
                        </div>
                        {m.type === 'area' && (
                          <div className="flex gap-1 items-center">
                            <label className="text-[10px] uppercase opacity-60">高度:</label>
                            <input 
                              value={editHeight}
                              onChange={e => setEditHeight(e.target.value)}
                              className="w-20 bg-white text-[#141414] text-xs px-2 py-1 border border-[#141414]"
                              placeholder="天花板高度"
                            />
                            <span className="text-[10px]">{currentPage?.scale?.unit || 'px'}</span>
                          </div>
                        )}
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditingId(null)} className="p-1 bg-gray-200 text-[#141414]">
                            <X size={14} />
                          </button>
                          <button onClick={saveEdit} className="p-1 bg-green-500 text-white">
                            <Check size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-baseline">
                        <div className="flex-1">
                          <span className="text-sm font-medium">{m.label}</span>
                          {m.type === 'area' && (
                            <div className="mt-1 space-y-0.5">
                              {m.perimeter && (
                                <div className="text-[10px] opacity-60">周長: {m.perimeter.toFixed(2)} {currentPage?.scale?.unit || 'px'}</div>
                              )}
                              {m.height && (
                                <div className="text-[10px] opacity-60">高度: {m.height.toFixed(2)} {currentPage?.scale?.unit || 'px'}</div>
                              )}
                              {m.wallArea && (
                                <div className="text-[10px] font-bold text-blue-600">牆面積: {m.wallArea.toFixed(2)} {currentPage?.scale?.unit || 'px'}²</div>
                              )}
                            </div>
                          )}
                        </div>
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
            onClick={saveProject}
            disabled={pages.length === 0}
            className="w-full py-3 border border-[#141414] flex items-center justify-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all uppercase text-xs tracking-widest font-bold disabled:opacity-20"
          >
            <Download size={16} />
            儲存專案 (.meas)
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-[#D1D0CC] overflow-hidden flex flex-col">
        {/* View Mode Toggle */}
        <div className="absolute top-6 right-6 z-20 flex bg-white border border-[#141414] shadow-xl">
          <button 
            onClick={() => setViewMode('2d')}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-bold transition-all ${viewMode === '2d' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-gray-100'}`}
          >
            2D 編輯
          </button>
          <button 
            onClick={() => setViewMode('3d')}
            disabled={!currentPage}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-bold transition-all ${viewMode === '3d' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-gray-100 disabled:opacity-30'}`}
          >
            3D 預覽
          </button>
        </div>

        {!currentPage ? (
          <div className="text-center max-w-md p-8 border border-dashed border-[#141414]/30 rounded-lg">
            <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload size={32} className="opacity-20" />
            </div>
            <h3 className="text-xl font-serif italic mb-2">準備好開始測量了嗎？</h3>
            <p className="text-sm opacity-60 mb-6">上傳建築圖面、地圖或任何帶有已知尺寸的照片。</p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-[#141414] text-[#E4E3E0] rounded-sm text-xs uppercase tracking-widest font-bold hover:opacity-90 transition-all"
              >
                選擇圖片
              </button>
              <button 
                onClick={() => projectInputRef.current?.click()}
                className="px-6 py-2 border border-[#141414] rounded-sm text-xs uppercase tracking-widest font-bold hover:bg-white transition-all"
              >
                開啟專案
              </button>
            </div>
          </div>
        ) : viewMode === '3d' ? (
          <ThreeDViewer page={currentPage} />
        ) : (
          <div className={`w-full h-full ${isSpacePressed || isMiddleMouseDown ? 'cursor-grab active:cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}>
            <Stage
              width={window.innerWidth - 320}
              height={window.innerHeight}
              scaleX={currentPage.stageScale}
              scaleY={currentPage.stageScale}
              x={currentPage.stagePos.x}
              y={currentPage.stagePos.y}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              onDragEnd={(e) => {
                if (e.target === e.target.getStage()) {
                  updateCurrentPage({
                    stagePos: { x: e.target.x(), y: e.target.y() }
                  });
                }
              }}
              ref={stageRef}
              draggable={tool === 'select' || isSpacePressed || isMiddleMouseDown}
            >
              <Layer>
                {image && <KonvaImage image={image} />}
                
                {/* Walls */}
                {currentPage.walls.map((w) => (
                  <Group key={w.id} onClick={() => toggleSelection(w.id)}>
                    <Line
                      points={w.points.flatMap(p => [p.x, p.y])}
                      stroke={selectedIds.includes(w.id) ? '#141414' : w.color}
                      strokeWidth={10 / currentPage.stageScale}
                      lineCap="round"
                      opacity={0.6}
                    />
                    {w.points.map((p, i) => (
                      <Circle 
                        key={i} 
                        x={p.x} 
                        y={p.y} 
                        radius={6 / currentPage.stageScale} 
                        fill={selectedIds.includes(w.id) ? '#141414' : w.color}
                        draggable={selectedIds.includes(w.id) && tool === 'select'}
                        onDragMove={(e) => handlePointDragMove(w.id, i, e)}
                      />
                    ))}
                  </Group>
                ))}

                {/* Doors */}
                {currentPage.doors.map((d) => (
                  <Group key={d.id} onClick={() => toggleSelection(d.id)}>
                    <Line
                      points={d.points.flatMap(p => [p.x, p.y])}
                      stroke="#92400e"
                      strokeWidth={6 / currentPage.stageScale}
                      dash={[10, 5]}
                    />
                    {d.points.map((p, i) => (
                      <Circle 
                        key={i} 
                        x={p.x} 
                        y={p.y} 
                        radius={6 / currentPage.stageScale} 
                        fill="#92400e"
                        draggable={selectedIds.includes(d.id) && tool === 'select'}
                        onDragMove={(e) => handlePointDragMove(d.id, i, e)}
                      />
                    ))}
                  </Group>
                ))}

                {/* Existing Measurements */}
                {currentPage.measurements.map((m) => (
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
                          strokeWidth={(selectedIds.includes(m.id) ? 3 : 2) / currentPage.stageScale}
                          draggable={selectedIds.includes(m.id) && tool === 'select'}
                          onDragStart={(e) => handleMeasurementDragStart(m.id, e)}
                          onDragMove={(e) => handleMeasurementDragMove(m.id, e)}
                          onMouseEnter={(e) => {
                            if (selectedIds.includes(m.id) && tool === 'select') {
                              const container = e.target.getStage().container();
                              container.style.cursor = 'move';
                            }
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage().container();
                            container.style.cursor = tool === 'select' ? 'default' : 'crosshair';
                          }}
                        />
                        {m.points.map((p, i) => (
                          <Circle 
                            key={i} 
                            x={p.x} 
                            y={p.y} 
                            radius={(selectedIds.includes(m.id) ? 6 : 4) / currentPage.stageScale} 
                            fill={selectedIds.includes(m.id) ? '#141414' : m.color}
                            stroke="white"
                            strokeWidth={1 / currentPage.stageScale}
                            draggable={selectedIds.includes(m.id) && tool === 'select'}
                            onDragMove={(e) => handlePointDragMove(m.id, i, e)}
                            onMouseEnter={(e) => {
                              if (selectedIds.includes(m.id) && tool === 'select') {
                                const container = e.target.getStage().container();
                                if (m.isRect) {
                                  const cursors = ['nw-resize', 'ne-resize', 'se-resize', 'sw-resize'];
                                  container.style.cursor = cursors[i] || 'move';
                                } else {
                                  container.style.cursor = 'move';
                                }
                              }
                            }}
                            onMouseLeave={(e) => {
                              const container = e.target.getStage().container();
                              container.style.cursor = tool === 'select' ? 'default' : 'crosshair';
                            }}
                          />
                        ))}
                        <Text
                          x={m.points[0].x}
                          y={m.points[0].y - 20 / currentPage.stageScale}
                          text={`${m.label}: ${m.value.toFixed(2)} ${m.unit}`}
                          fontSize={14 / currentPage.stageScale}
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
                          strokeWidth={(selectedIds.includes(m.id) ? 3 : 2) / currentPage.stageScale}
                          fill={m.color + (selectedIds.includes(m.id) ? '66' : '33')}
                          closed
                          draggable={selectedIds.includes(m.id) && tool === 'select'}
                          onDragStart={(e) => handleMeasurementDragStart(m.id, e)}
                          onDragMove={(e) => handleMeasurementDragMove(m.id, e)}
                          onMouseEnter={(e) => {
                            if (selectedIds.includes(m.id) && tool === 'select') {
                              const container = e.target.getStage().container();
                              container.style.cursor = 'move';
                            }
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage().container();
                            container.style.cursor = tool === 'select' ? 'default' : 'crosshair';
                          }}
                        />
                        {m.points.map((p, i) => (
                          <Circle 
                            key={i} 
                            x={p.x} 
                            y={p.y} 
                            radius={(selectedIds.includes(m.id) ? 6 : 4) / currentPage.stageScale} 
                            fill={selectedIds.includes(m.id) ? '#141414' : m.color}
                            stroke="white"
                            strokeWidth={1 / currentPage.stageScale}
                            draggable={selectedIds.includes(m.id) && tool === 'select'}
                            onDragMove={(e) => handlePointDragMove(m.id, i, e)}
                            onMouseEnter={(e) => {
                              if (selectedIds.includes(m.id) && tool === 'select') {
                                const container = e.target.getStage().container();
                                if (m.isRect) {
                                  const cursors = ['nw-resize', 'ne-resize', 'se-resize', 'sw-resize'];
                                  container.style.cursor = cursors[i] || 'move';
                                } else {
                                  container.style.cursor = 'move';
                                }
                              }
                            }}
                            onMouseLeave={(e) => {
                              const container = e.target.getStage().container();
                              container.style.cursor = tool === 'select' ? 'default' : 'crosshair';
                            }}
                          />
                        ))}
                        <Text
                          x={m.points.reduce((acc, p) => acc + p.x, 0) / m.points.length}
                          y={m.points.reduce((acc, p) => acc + p.y, 0) / m.points.length}
                          text={`${m.label}: ${m.value.toFixed(2)} ${m.unit}${m.type === 'area' && getPingValue(m.value, m.unit) ? ` (${getPingValue(m.value, m.unit)} 坪)` : ''}${m.wallArea ? `\n牆面積: ${m.wallArea.toFixed(2)} ${m.unit}` : ''}`}
                          fontSize={14 / currentPage.stageScale}
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
                    {tool === 'scale' || tool === 'wall' || tool === 'door' ? (
                      <>
                        <Line
                          points={[currentPoints[0].x, currentPoints[0].y, previewPoint.x, previewPoint.y]}
                          stroke="#ef4444"
                          strokeWidth={2 / currentPage.stageScale}
                          dash={[5, 5]}
                        />
                        <Circle x={currentPoints[0].x} y={currentPoints[0].y} radius={4 / currentPage.stageScale} fill="#ef4444" />
                      </>
                    ) : (tool === 'length' || tool === 'area') ? (
                      <>
                        <Line
                          points={[...currentPoints.flatMap(p => [p.x, p.y]), previewPoint.x, previewPoint.y]}
                          stroke="#ef4444"
                          strokeWidth={2 / currentPage.stageScale}
                          dash={[5, 5]}
                          closed={false}
                        />
                        {currentPoints.map((p, i) => (
                          <Circle key={`drawing-point-${i}`} x={p.x} y={p.y} radius={4 / currentPage.stageScale} fill="#ef4444" />
                        ))}
                      </>
                    ) : tool === 'rect' ? (
                      <>
                        <Line
                          points={[
                            currentPoints[0].x, currentPoints[0].y,
                            previewPoint.x, currentPoints[0].y,
                            previewPoint.x, previewPoint.y,
                            currentPoints[0].x, previewPoint.y
                          ]}
                          stroke="#ef4444"
                          strokeWidth={2 / currentPage.stageScale}
                          dash={[5, 5]}
                          closed
                        />
                        <Circle x={currentPoints[0].x} y={currentPoints[0].y} radius={4 / currentPage.stageScale} fill="#ef4444" />
                      </>
                    ) : null}
                  </Group>
                )}
              </Layer>
            </Stage>

            {/* Canvas Controls Overlay */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2">
              <button 
                onClick={() => updateCurrentPage({ stageScale: currentPage.stageScale * 1.2 })}
                className="w-10 h-10 bg-white border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <Maximize2 size={18} />
              </button>
              <button 
                onClick={() => updateCurrentPage({ stageScale: currentPage.stageScale / 1.2 })}
                className="w-10 h-10 bg-white border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <Minimize2 size={18} />
              </button>
              <button 
                onClick={() => {
                  updateCurrentPage({ stageScale: 1, stagePos: { x: 0, y: 0 } });
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
                    onClick={() => finishMeasurement()}
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
        {/* Modals */}
        <AnimatePresence>
          {confirmModal.show && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-[#141414] p-6 max-w-sm w-full shadow-2xl"
              >
                <h3 className={`text-lg font-serif italic mb-2 ${confirmModal.type === 'danger' ? 'text-red-600' : ''}`}>
                  {confirmModal.title}
                </h3>
                <p className="text-sm opacity-70 mb-6">{confirmModal.message}</p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                    className="px-4 py-2 text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal(prev => ({ ...prev, show: false }));
                    }}
                    className={`px-4 py-2 text-xs uppercase tracking-widest text-white transition-all ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#141414] hover:bg-black'}`}
                  >
                    確定
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {errorModal.show && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-[#141414] p-6 max-w-sm w-full shadow-2xl"
              >
                <div className="flex items-center gap-2 text-red-600 mb-2">
                  <X size={20} />
                  <h3 className="text-lg font-serif italic">{errorModal.title}</h3>
                </div>
                <p className="text-sm opacity-70 mb-6">{errorModal.message}</p>
                <div className="flex justify-end">
                  <button 
                    onClick={() => setErrorModal(prev => ({ ...prev, show: false }))}
                    className="px-4 py-2 text-xs uppercase tracking-widest bg-[#141414] text-white hover:bg-black transition-all"
                  >
                    關閉
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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

      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,.pdf" 
        multiple
        onChange={handleImageUpload} 
      />
      <input 
        type="file" 
        ref={projectInputRef} 
        className="hidden" 
        accept=".meas" 
        onChange={loadProject} 
      />
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
