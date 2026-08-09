import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { KnowledgeGraph } from '../../utils/api';

interface NodeData {
  id: string;
  label: string;
  category: 'tech' | 'database' | 'ai' | 'concept' | 'store';
  color: string;
  radius: number;
  originX: number; // Normalized 0..1
  originY: number; // Normalized 0..1
  depthLayer: number; // 0.6 = background, 1.0 = midground, 1.4 = foreground
  pulsePhase: number;
  floatSpeedX: number;
  floatSpeedY: number;
  floatAmpX: number;
  floatAmpY: number;
  // Dynamic state
  x: number;
  y: number;
  vx: number;
  vy: number;
  currentRadius: number;
}

interface EdgeData {
  source: string;
  target: string;
  pulseOffset: number;
  speed: number;
}

interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

const NODES_CONFIG: Omit<NodeData, 'x' | 'y' | 'vx' | 'vy' | 'currentRadius'>[] = [
  { id: '1', label: 'CortexGraph', category: 'ai', color: '#6c5ce7', radius: 14, originX: 0.5, originY: 0.38, depthLayer: 1.4, pulsePhase: 0, floatSpeedX: 0.0008, floatSpeedY: 0.0011, floatAmpX: 12, floatAmpY: 10 },
  { id: '2', label: 'Neo4j Graph', category: 'database', color: '#34d399', radius: 10, originX: 0.28, originY: 0.28, depthLayer: 1.0, pulsePhase: 1.2, floatSpeedX: 0.0012, floatSpeedY: 0.0009, floatAmpX: 15, floatAmpY: 12 },
  { id: '3', label: 'Gemini 3.6', category: 'ai', color: '#38bdf8', radius: 11, originX: 0.72, originY: 0.26, depthLayer: 1.2, pulsePhase: 2.4, floatSpeedX: 0.0009, floatSpeedY: 0.0013, floatAmpX: 14, floatAmpY: 11 },
  { id: '4', label: 'Vector RAG', category: 'concept', color: '#c084fc', radius: 9, originX: 0.2, originY: 0.54, depthLayer: 0.8, pulsePhase: 0.8, floatSpeedX: 0.0014, floatSpeedY: 0.0008, floatAmpX: 18, floatAmpY: 14 },
  { id: '5', label: 'ChromaDB', category: 'store', color: '#f472b6', radius: 9.5, originX: 0.8, originY: 0.52, depthLayer: 0.9, pulsePhase: 3.1, floatSpeedX: 0.0011, floatSpeedY: 0.0014, floatAmpX: 16, floatAmpY: 13 },
  { id: '6', label: 'FastAPI', category: 'tech', color: '#fbbf24', radius: 8.5, originX: 0.34, originY: 0.72, depthLayer: 0.7, pulsePhase: 1.9, floatSpeedX: 0.0007, floatSpeedY: 0.0012, floatAmpX: 12, floatAmpY: 15 },
  { id: '7', label: 'React 19', category: 'tech', color: '#38bdf8', radius: 9, originX: 0.66, originY: 0.74, depthLayer: 1.0, pulsePhase: 2.8, floatSpeedX: 0.0013, floatSpeedY: 0.0007, floatAmpX: 14, floatAmpY: 10 },
  { id: '8', label: 'Knowledge Extraction', category: 'concept', color: '#22d3ee', radius: 8, originX: 0.44, originY: 0.18, depthLayer: 0.6, pulsePhase: 4.2, floatSpeedX: 0.001, floatSpeedY: 0.001, floatAmpX: 10, floatAmpY: 8 },
  { id: '9', label: 'Semantic Embeddings', category: 'ai', color: '#a78bfa', radius: 7.5, originX: 0.56, originY: 0.82, depthLayer: 0.7, pulsePhase: 0.5, floatSpeedX: 0.0012, floatSpeedY: 0.0011, floatAmpX: 12, floatAmpY: 14 },
];

const EDGES_CONFIG: EdgeData[] = [
  { source: '1', target: '2', pulseOffset: 0, speed: 0.002 },
  { source: '1', target: '3', pulseOffset: 0.3, speed: 0.0025 },
  { source: '1', target: '4', pulseOffset: 0.6, speed: 0.0018 },
  { source: '1', target: '5', pulseOffset: 0.2, speed: 0.0022 },
  { source: '1', target: '8', pulseOffset: 0.8, speed: 0.003 },
  { source: '2', target: '4', pulseOffset: 0.1, speed: 0.002 },
  { source: '3', target: '5', pulseOffset: 0.4, speed: 0.0024 },
  { source: '4', target: '6', pulseOffset: 0.7, speed: 0.0019 },
  { source: '5', target: '7', pulseOffset: 0.5, speed: 0.0021 },
  { source: '6', target: '7', pulseOffset: 0.9, speed: 0.0017 },
  { source: '7', target: '9', pulseOffset: 0.35, speed: 0.0023 },
  { source: '6', target: '9', pulseOffset: 0.65, speed: 0.002 },
];

interface HeroCanvasProps {
  onNodeClick?: (label: string) => void;
  graphData?: KnowledgeGraph | null;
}

export const HeroKnowledgeGraphCanvasComponent: React.FC<HeroCanvasProps> = ({ onNodeClick, graphData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  const mousePosRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000 });
  const isHoveredRef = useRef(false);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const ripplesRef = useRef<ClickRipple[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const [hoveredNodeLabel, setHoveredNodeLabel] = useState<string | null>(null);

  // Initialize mutable node and edge list
  const nodesRef = useRef<NodeData[]>(
    NODES_CONFIG.map((c) => ({
      ...c,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      currentRadius: c.radius,
    }))
  );

  const edgesRef = useRef<EdgeData[]>(EDGES_CONFIG);

  // Handle dynamic mapping of ingested graphData
  useEffect(() => {
    if (graphData && graphData.entities.length > 0) {
      const mappedNodes = graphData.entities.map((e, index) => {
        const categories: NodeData['category'][] = ['tech', 'database', 'ai', 'concept', 'store'];
        const cat = categories[index % categories.length];

        let color = '#a78bfa';
        if (e.type.toLowerCase().includes('person')) color = '#38bdf8';
        else if (e.type.toLowerCase().includes('tech')) color = '#c084fc';
        else if (e.type.toLowerCase().includes('database')) color = '#34d399';
        else if (e.type.toLowerCase().includes('org')) color = '#fbbf24';

        const angle = (index / graphData.entities.length) * Math.PI * 2;
        const oX = 0.5 + Math.cos(angle) * 0.26;
        const oY = 0.5 + Math.sin(angle) * 0.26;

        return {
          id: e.id,
          label: e.name,
          category: cat,
          color,
          radius: 9 + (index % 5) * 1.5,
          originX: oX,
          originY: oY,
          depthLayer: 0.8 + (index % 3) * 0.3,
          pulsePhase: index * 0.6,
          floatSpeedX: 0.0007,
          floatSpeedY: 0.0007,
          floatAmpX: 12,
          floatAmpY: 12,
          x: (containerRef.current?.getBoundingClientRect().width || 800) * oX,
          y: (containerRef.current?.getBoundingClientRect().height || 600) * oY,
          vx: 0,
          vy: 0,
          currentRadius: 8,
        };
      });

      const mappedEdges = graphData.relationships.map((r) => ({
        source: r.source,
        target: r.target,
        pulseOffset: Math.random() * Math.PI,
        speed: 0.002,
      }));

      nodesRef.current = mappedNodes;
      edgesRef.current = mappedEdges;
    } else {
      nodesRef.current = NODES_CONFIG.map((c) => ({
        ...c,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        currentRadius: c.radius,
      }));
      edgesRef.current = EDGES_CONFIG;
    }
  }, [graphData]);

  // Handle Resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  useEffect(() => {
    handleResize();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(container);

    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  // Handle Mouse / Touch Events
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mousePosRef.current.targetX = e.clientX - rect.left;
    mousePosRef.current.targetY = e.clientY - rect.top;
    isHoveredRef.current = true;
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    mousePosRef.current.targetX = -1000;
    mousePosRef.current.targetY = -1000;
    hoveredNodeIdRef.current = null;
    setHoveredNodeLabel(null);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !e.touches[0]) return;
    const rect = container.getBoundingClientRect();
    mousePosRef.current.targetX = e.touches[0].clientX - rect.left;
    mousePosRef.current.targetY = e.touches[0].clientY - rect.top;
    isHoveredRef.current = true;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Add shockwave ripple
    ripplesRef.current.push({
      x: clickX,
      y: clickY,
      radius: 0,
      maxRadius: Math.max(rect.width, rect.height) * 0.45,
      alpha: 0.8,
      color: '#6c5ce7',
    });

    // Check if clicked a node
    const clickedNode = nodesRef.current.find((node) => {
      const dist = Math.hypot(node.x - clickX, node.y - clickY);
      return dist <= node.radius * 2.5;
    });

    if (clickedNode && onNodeClickRef.current) {
      onNodeClickRef.current(clickedNode.label);
    }
  };

  // Main 60 FPS Canvas Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let time = 0;

    const render = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const ctx = canvas.getContext('2d');

      if (!ctx || width === 0 || height === 0) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      time += 0.016;

      // Smooth mouse interpolation (spring feel)
      mousePosRef.current.x += (mousePosRef.current.targetX - mousePosRef.current.x) * 0.12;
      mousePosRef.current.y += (mousePosRef.current.targetY - mousePosRef.current.y) * 0.12;

      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Parallax center offsets
      const centerX = width / 2;
      const centerY = height / 2;
      const parallaxFactorX = isHoveredRef.current ? (mx - centerX) / width : 0;
      const parallaxFactorY = isHoveredRef.current ? (my - centerY) / height : 0;

      // Update Node positions & physics
      let currentHovered: NodeData | null = null;

      nodesRef.current.forEach((node) => {
        // Base floating origin with parallax layer offset
        const baseOriginX = node.originX * width + parallaxFactorX * (node.depthLayer - 1) * 35;
        const baseOriginY = node.originY * height + parallaxFactorY * (node.depthLayer - 1) * 35;

        // Harmonic floating offset
        const floatX = Math.sin(time * node.floatSpeedX * 100 + node.pulsePhase) * node.floatAmpX;
        const floatY = Math.cos(time * node.floatSpeedY * 100 + node.pulsePhase) * node.floatAmpY;

        let targetX = baseOriginX + floatX;
        let targetY = baseOriginY + floatY;

        // Magnetic Mouse Repulsion / Attraction
        if (isHoveredRef.current && mx > 0 && my > 0) {
          const dx = targetX - mx;
          const dy = targetY - my;
          const dist = Math.hypot(dx, dy);
          const maxRepelDist = 170;

          if (dist < maxRepelDist) {
            const force = (1 - dist / maxRepelDist) ** 2;
            const repelAngle = Math.atan2(dy, dx);
            targetX += Math.cos(repelAngle) * force * 38 * node.depthLayer;
            targetY += Math.sin(repelAngle) * force * 38 * node.depthLayer;
          }

          // Check cursor hover detection
          if (dist < node.radius * 2.2) {
            currentHovered = node;
          }
        }

        // Apply velocities & spring easing
        node.vx = (targetX - node.x) * 0.08;
        node.vy = (targetY - node.y) * 0.08;
        node.x += node.vx;
        node.y += node.vy;

        // Animate radius pulse
        const pulse = Math.sin(time * 2 + node.pulsePhase) * 0.12;
        const isThisHovered = currentHovered?.id === node.id;
        const targetRadius = isThisHovered ? node.radius * 1.45 : node.radius * (1 + pulse);
        node.currentRadius += (targetRadius - node.currentRadius) * 0.15;
      });

      // Update hovered state for tooltip (only when hovered node changes)
      const newHoveredId = currentHovered ? (currentHovered as NodeData).id : null;
      if (hoveredNodeIdRef.current !== newHoveredId) {
        hoveredNodeIdRef.current = newHoveredId;
        setHoveredNodeLabel(currentHovered ? (currentHovered as NodeData).label : null);
      }

      // Draw Click Ripples
      ripplesRef.current.forEach((ripple) => {
        ripple.radius += (ripple.maxRadius - ripple.radius) * 0.08;
        ripple.alpha -= 0.025;

        if (ripple.alpha > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(108, 92, 231, ${ripple.alpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      });
      ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0);

      // Draw Edges with glowing animated energy pulses
      const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));

      edgesRef.current.forEach((edgeConfig) => {
        const n1 = nodeMap.get(edgeConfig.source);
        const n2 = nodeMap.get(edgeConfig.target);
        if (!n1 || !n2) return;

        // Base line gradient
        const lineGrad = ctx.createLinearGradient(n1.x, n1.y, n2.x, n2.y);
        lineGrad.addColorStop(0, n1.color + '44');
        lineGrad.addColorStop(1, n2.color + '44');

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Traveling energy pulse dot
        const progress = (time * edgeConfig.speed * 60 + edgeConfig.pulseOffset) % 1;
        const px = n1.x + (n2.x - n1.x) * progress;
        const py = n1.y + (n2.y - n1.y) * progress;

        const particleGrad = ctx.createRadialGradient(px, py, 0, px, py, 5);
        particleGrad.addColorStop(0, '#ffffff');
        particleGrad.addColorStop(0.5, n1.color);
        particleGrad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = particleGrad;
        ctx.fill();
        ctx.restore();
      });

      // Draw Cursor Connection Beams if cursor is near nodes
      if (isHoveredRef.current && mx > 0 && my > 0) {
        nodesRef.current.forEach((node) => {
          const dist = Math.hypot(node.x - mx, node.y - my);
          if (dist < 180) {
            const beamAlpha = (1 - dist / 180) * 0.45;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(node.x, node.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${beamAlpha})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.restore();
          }
        });

        // Draw cursor light point
        ctx.save();
        const cursorGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 35);
        cursorGlow.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
        cursorGlow.addColorStop(0.5, 'rgba(108, 92, 231, 0.15)');
        cursorGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = cursorGlow;
        ctx.beginPath();
        ctx.arc(mx, my, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Nodes
      nodesRef.current.forEach((node) => {
        const isHovered = hoveredNodeIdRef.current === node.id;

        ctx.save();

        // 1. Soft Outer Radial Bloom
        const bloomRadius = node.currentRadius * (isHovered ? 4.5 : 3.2);
        const bloom = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, bloomRadius);
        bloom.addColorStop(0, node.color + (isHovered ? '77' : '33'));
        bloom.addColorStop(0.5, node.color + '15');
        bloom.addColorStop(1, 'transparent');

        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(node.x, node.y, bloomRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Pulsing Ring
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.currentRadius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // 3. Node Core
        const coreGrad = ctx.createRadialGradient(
          node.x - node.currentRadius * 0.3,
          node.y - node.currentRadius * 0.3,
          0,
          node.x,
          node.y,
          node.currentRadius
        );
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.4, node.color);
        coreGrad.addColorStop(1, node.color + 'dd');

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Subtle Specular Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(
          node.x - node.currentRadius * 0.3,
          node.y - node.currentRadius * 0.3,
          node.currentRadius * 0.25,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // 5. Node Label
        ctx.font = `${isHovered ? '600 12px' : '500 11px'} 'Inter', system-ui, sans-serif`;
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(248, 250, 252, 0.75)';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.currentRadius + 15);

        ctx.restore();
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onClick={handleClick}
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto cursor-crosshair z-0"
      style={{ userSelect: 'none' }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating Hover Glassmorphic Badge */}
      {hoveredNodeLabel && (
        <div
          className="absolute top-4 right-4 pointer-events-none px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-mono font-semibold transition-all duration-200 animate-fade-up shadow-xl"
          style={{
            background: 'rgba(28, 29, 36, 0.85)',
            borderColor: 'rgba(108, 92, 231, 0.4)',
            color: '#22d3ee',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          }}
        >
          <span className="text-slate-400">Node:</span> {hoveredNodeLabel}
        </div>
      )}
    </div>
  );
};

export const HeroKnowledgeGraphCanvas = React.memo(HeroKnowledgeGraphCanvasComponent);
