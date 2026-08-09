import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo, useCallback } from 'react';
import type { KnowledgeGraph, Entity, Relationship } from '../utils/api';
import { Network, Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Filter, Search } from 'lucide-react';

export interface GraphVisualizerRef {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
}

interface GraphVisualizerProps {
  data: KnowledgeGraph | null;
  activatedNodeIds: string[];
  selectedTypeFilter: string;
  searchQuery: string;
  onSelectEntity: (entity: Entity | null) => void;
  selectedEntityId?: string | null;
  isDark: boolean;
  isLoading?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onSearchChange: (q: string) => void;
  onFilterChange: (type: string) => void;
  availableTypes: string[];
}

interface SimNode {
  id: string;
  name: string;
  type: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  isDragging: boolean;
  pulsePhase: number;
  radius: number;
  scale: number;
  glow: number;
  rawEntity: Entity;
}

interface SimLink {
  id: string;
  source: string;
  target: string;
  label: string;
  particleOffset: number; // 0..1 flow offset
  particleSpeed: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export const GraphVisualizer = forwardRef<GraphVisualizerRef, GraphVisualizerProps>(
  ({
    data,
    activatedNodeIds,
    selectedTypeFilter,
    searchQuery,
    onSelectEntity,
    selectedEntityId,
    isDark,
    isLoading,
    isFullscreen,
    onToggleFullscreen,
    onSearchChange,
    onFilterChange,
    availableTypes,
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [showFilter, setShowFilter] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // Synchronization refs for direct access in simulation loop
    const mousePosRef = useRef({ x: -2000, y: -2000 });
    const activeDragNodeIdRef = useRef<string | null>(null);

    // List of nodes and links
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);
    const [simLinks, setSimLinks] = useState<SimLink[]>([]);
    const nodesRef = useRef<SimNode[]>([]);
    const linksRef = useRef<SimLink[]>([]);

    // Ambient floating dust particles
    const ambientParticlesRef = useRef<AmbientParticle[]>([]);

    // Sync refs
    useEffect(() => {
      zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
      panRef.current = pan;
    }, [pan]);

    // Parse color categories
    const getNodeColor = useCallback((type: string): string => {
      const t = type.toLowerCase();
      if (t.includes('person') || t.includes('user')) return '#38bdf8';
      if (t.includes('technology') || t.includes('framework') || t.includes('api')) return '#c084fc';
      if (t.includes('database') || t.includes('store')) return '#34d399';
      if (t.includes('project') || t.includes('product')) return '#f472b6';
      if (t.includes('company') || t.includes('org')) return '#fbbf24';
      return '#a78bfa'; // CortexGraph default purple
    }, []);

    // Filter rules
    const filteredGraphData = useMemo(() => {
      if (!data || data.entities.length === 0) {
        return { entities: [], relationships: [] };
      }

      const filteredEntities = data.entities.filter((e) => {
        const matchesType = selectedTypeFilter === 'ALL' || e.type.toUpperCase() === selectedTypeFilter.toUpperCase();
        const matchesSearch = !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.id.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
      });

      const filteredIds = new Set(filteredEntities.map((e) => e.id));
      const filteredRelationships = data.relationships.filter(
        (r) => filteredIds.has(r.source) && filteredIds.has(r.target)
      );

      return { entities: filteredEntities, relationships: filteredRelationships };
    }, [data, selectedTypeFilter, searchQuery]);

    // Pre-run force simulation to compute elegant target layout resting positions
    const runForceLayout = useCallback((entities: Entity[], relationships: Relationship[]) => {
      const numNodes = entities.length;
      if (numNodes === 0) return { nodes: [], links: [] };

      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;

      // Count connection degree of all nodes
      const nodeDegrees = new Map<string, number>();
      relationships.forEach((r) => {
        nodeDegrees.set(r.source, (nodeDegrees.get(r.source) || 0) + 1);
        nodeDegrees.set(r.target, (nodeDegrees.get(r.target) || 0) + 1);
      });

      // Initialize positions on a spiral or circle to ensure elegant spreading
      const tempNodes = entities.map((e, index) => {
        const angle = (index / numNodes) * Math.PI * 2;
        const dist = 100 + index * 26; // spread out wider initially

        const degree = nodeDegrees.get(e.id) || 0;
        const isMainNode = degree >= 2;
        // Main nodes have different colors, normal nodes have fixed slate color
        const color = isMainNode ? getNodeColor(e.type) : '#94a3b8';
        const radius = isMainNode ? 9.5 : 6.5;

        return {
          id: e.id,
          name: e.name,
          type: e.type,
          color,
          x: cx + Math.cos(angle) * dist + (Math.random() - 0.5) * 40,
          y: cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 40,
          vx: 0,
          vy: 0,
          targetX: cx,
          targetY: cy,
          isDragging: false,
          pulsePhase: Math.random() * Math.PI * 2,
          radius,
          scale: 1,
          glow: 0.2,
          rawEntity: e,
        };
      });

      const tempLinks = relationships.map((r, index) => ({
        id: `${r.source}->${r.target}-${index}`,
        source: r.source,
        target: r.target,
        label: r.type,
        particleOffset: Math.random(),
        particleSpeed: 0.004 + Math.random() * 0.003,
      }));

      // Map node ids to quickly look them up
      const nodeMap = new Map<string, typeof tempNodes[0]>();
      tempNodes.forEach((n) => nodeMap.set(n.id, n));

      // Run D3-style simulation iteration ticks offline - configured to be vast
      const iterations = 190;
      const gravity = 0.012; // weak gravity to let nodes spread out vast
      const chargeStrength = 880; // strong repulsion to push nodes apart
      const linkDistance = 240; // long links to expand graph dimensions

      for (let step = 0; step < iterations; step++) {
        // 1. Repulsion force between every pair of nodes
        for (let i = 0; i < tempNodes.length; i++) {
          const n1 = tempNodes[i];
          for (let j = i + 1; j < tempNodes.length; j++) {
            const n2 = tempNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy || 1;
            const dist = Math.sqrt(distSq);

            if (dist < 400) {
              const force = chargeStrength / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }

        // 2. Attraction force along connection edges
        tempLinks.forEach((link) => {
          const nSrc = nodeMap.get(link.source);
          const nTgt = nodeMap.get(link.target);
          if (!nSrc || !nTgt) return;

          const dx = nTgt.x - nSrc.x;
          const dy = nTgt.y - nSrc.y;
          const dist = Math.hypot(dx, dy) || 1;
          const force = (dist - linkDistance) * 0.045;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          nSrc.vx += fx;
          nSrc.vy += fy;
          nTgt.vx -= fx;
          nTgt.vy -= fy;
        });

        // 3. Gravity pulling towards center
        tempNodes.forEach((n) => {
          const dx = cx - n.x;
          const dy = cy - n.y;
          n.vx += dx * gravity;
          n.vy += dy * gravity;

          // Apply velocity and drag friction
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.72;
          n.vy *= 0.72;
        });
      }

      // Assign final positions as both target resting positions and initial positions
      tempNodes.forEach((n) => {
        n.targetX = n.x;
        n.targetY = n.y;
      });

      return { nodes: tempNodes, links: tempLinks };
    }, [dimensions, getNodeColor]);

    // Build the graph on new datasets or filters
    useEffect(() => {
      const { entities, relationships } = filteredGraphData;
      if (entities.length === 0) {
        setSimNodes([]);
        setSimLinks([]);
        nodesRef.current = [];
        linksRef.current = [];
        return;
      }

      const { nodes, links } = runForceLayout(entities, relationships);

      // Preserve existing positions if nodes are already present to prevent jumps
      const prevNodesMap = new Map<string, SimNode>();
      nodesRef.current.forEach((n) => prevNodesMap.set(n.id, n));

      nodes.forEach((n) => {
        const prev = prevNodesMap.get(n.id);
        if (prev) {
          n.x = prev.x;
          n.y = prev.y;
          n.vx = prev.vx;
          n.vy = prev.vy;
        }
      });

      setSimNodes(nodes);
      setSimLinks(links);
      nodesRef.current = nodes;
      linksRef.current = links;

      // Recenter simulation after layout
      setTimeout(recenterLayout, 100);
    }, [filteredGraphData, runForceLayout]);

    // Recenter layout view to bounding box of all nodes
    const recenterLayout = useCallback(() => {
      const nodes = nodesRef.current;
      if (nodes.length === 0) return;

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      nodes.forEach((n) => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      });

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const graphW = maxX - minX || 100;
      const graphH = maxY - minY || 100;

      const scaleX = (dimensions.width * 0.72) / graphW;
      const scaleY = (dimensions.height * 0.72) / graphH;
      const newZoom = Math.max(Math.min(scaleX, scaleY, 2.5), 0.45);

      const newPanX = dimensions.width / 2 - centerX * newZoom;
      const newPanY = dimensions.height / 2 - centerY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }, [dimensions]);

    useImperativeHandle(ref, () => ({
      zoomIn: () => setZoom((z) => Math.min(z * 1.3, 3)),
      zoomOut: () => setZoom((z) => Math.max(z / 1.3, 0.25)),
      recenter: recenterLayout,
    }));

    // Listen to container resizing
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleResize = () => {
        const rect = container.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800,
          height: rect.height || 600,
        });
      };

      handleResize();
      const obs = new ResizeObserver(handleResize);
      obs.observe(container);
      window.addEventListener('resize', handleResize);

      return () => {
        obs.disconnect();
        window.removeEventListener('resize', handleResize);
      };
    }, []);

    // Resize canvas pixels
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    }, [dimensions]);

    // Handle initial state of ambient background dust
    useEffect(() => {
      const dust: AmbientParticle[] = [];
      for (let i = 0; i < 45; i++) {
        dust.push({
          x: Math.random() * dimensions.width,
          y: Math.random() * dimensions.height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          size: 1 + Math.random() * 2.2,
          alpha: 0.12 + Math.random() * 0.25,
        });
      }
      ambientParticlesRef.current = dust;
    }, [dimensions]);

    // Core spring physics, dragging, cursor forcefield, and graphics loop
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let animId: number;

      // Spring physics parameters: critically damped spring back
      const springK = 0.08;
      const damping = 0.65;
      const linkPullK = 0.035;

      const frame = () => {
        const nodes = nodesRef.current;
        const links = linksRef.current;
        const ambient = ambientParticlesRef.current;
        const mouse = mousePosRef.current;
        const activeDragId = activeDragNodeIdRef.current;

        // Clear view
        ctx.clearRect(0, 0, dimensions.width, dimensions.height);

        // 1. PHYSICS LAYER: Spring oscillation & mouse proximity forces
        nodes.forEach((node) => {
          node.pulsePhase += 0.02;
          node.glow = 0.25 + Math.sin(node.pulsePhase) * 0.15;

          // Convert mouse coordinates into world coordinates
          const worldMouseX = (mouse.x - panRef.current.x) / zoomRef.current;
          const worldMouseY = (mouse.y - panRef.current.y) / zoomRef.current;

          if (node.isDragging) {
            // Node tracks cursor exactly
            node.x = worldMouseX;
            node.y = worldMouseY;
            node.vx = 0;
            node.vy = 0;
          } else {
            // Damped spring-back towards target resting positions
            const dx = node.targetX - node.x;
            const dy = node.targetY - node.y;

            const springFx = dx * springK;
            const springFy = dy * springK;

            node.vx = (node.vx + springFx) * damping;
            node.vy = (node.vy + springFy) * damping;

            // Cursor proximity deflection force field
            const distToMouse = Math.hypot(worldMouseX - node.x, worldMouseY - node.y);
            if (distToMouse < 260 && !activeDragId) {
              const angle = Math.atan2(node.y - worldMouseY, node.x - worldMouseX);

              if (distToMouse < 65) {
                // Strong repel when extremely close
                const repelForce = (65 - distToMouse) * 0.35;
                node.vx += Math.cos(angle) * repelForce;
                node.vy += Math.sin(angle) * repelForce;
                node.scale = 0.9 + (distToMouse / 65) * 0.2;
                node.glow = Math.min(node.glow + 0.55, 1.0);
              } else {
                // Attract slightly at intermediate distance
                const pullForce = (distToMouse - 65) * 0.02;
                node.vx -= Math.cos(angle) * pullForce;
                node.vy -= Math.sin(angle) * pullForce;
                node.scale = 1.0 + (1.0 - (distToMouse - 65) / 195) * 0.18;
                node.glow = Math.min(node.glow + 0.35, 0.9);
              }
            } else {
              node.scale += (1.0 - node.scale) * 0.1;
            }

            node.x += node.vx;
            node.y += node.vy;
          }
        });

        // 2. SPRING EDGE PHYSICS: Grabbing a node pulls connected neighbors dynamically
        if (activeDragId) {
          const activeNode = nodes.find((n) => n.id === activeDragId);
          if (activeNode) {
            links.forEach((link) => {
              if (link.source === activeDragId || link.target === activeDragId) {
                const neighborId = link.source === activeDragId ? link.target : link.source;
                const neighbor = nodes.find((n) => n.id === neighborId);
                if (neighbor && !neighbor.isDragging) {
                  const dx = activeNode.x - neighbor.x;
                  const dy = activeNode.y - neighbor.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  const stretchForce = (dist - 120) * linkPullK;

                  neighbor.vx += (dx / dist) * stretchForce;
                  neighbor.vy += (dy / dist) * stretchForce;
                  neighbor.x += neighbor.vx * 0.15;
                  neighbor.y += neighbor.vy * 0.15;
                }
              }
            });
          }
        }

        // Apply camera translate + scale transforms
        ctx.save();
        ctx.translate(panRef.current.x, panRef.current.y);
        ctx.scale(zoomRef.current, zoomRef.current);

        // 3. DRAW AMBIENT DUST
        ambient.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) p.x = dimensions.width;
          if (p.x > dimensions.width) p.x = 0;
          if (p.y < 0) p.y = dimensions.height;
          if (p.y > dimensions.height) p.y = 0;

          // Convert coordinates to zoom space
          ctx.fillStyle = isDark ? `rgba(244, 244, 255, ${p.alpha})` : `rgba(15, 23, 42, ${p.alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Mapping node references for curve computations
        const nodeMap = new Map<string, SimNode>();
        nodes.forEach((n) => nodeMap.set(n.id, n));

        // Hovered neighbor tracker
        const activeFocusedId = selectedEntityId || activeDragId;
        const activeConnectedNodeIds = new Set<string>();
        if (activeFocusedId) {
          activeConnectedNodeIds.add(activeFocusedId);
          links.forEach((l) => {
            if (l.source === activeFocusedId) activeConnectedNodeIds.add(l.target);
            if (l.target === activeFocusedId) activeConnectedNodeIds.add(l.source);
          });
        }

        // 4. DRAW BÉZIER CONNECTIONS AND ENERGY PACKETS
        links.forEach((link) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return;

          // Verify node coords are defined to prevent rendering glitch
          if (src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) return;

          // Calculate Quadratic control coordinates
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.hypot(dx, dy) || 1;

          // Curves offset perpendicular to straight edge
          const px = -dy / dist;
          const py = dx / dist;
          const curveHeight = Math.min(30, dist * 0.15);
          const cx = mx + px * curveHeight;
          const cy = my + py * curveHeight;

          // Connectivity visual settings
          const isActivated = activatedNodeIds.includes(src.id) && activatedNodeIds.includes(tgt.id);
          const isFocused = activeFocusedId && (src.id === activeFocusedId || tgt.id === activeFocusedId);
          const isDimmed = activeFocusedId && !isFocused;

          ctx.save();
          ctx.globalAlpha = isDimmed ? 0.08 : 1.0;

          // Render connection lines as simple white strings (or dark strings in light mode)
          let edgeColor = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.12)';
          if (isActivated || isFocused) {
            edgeColor = isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(15, 23, 42, 0.55)';
          }

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y);
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = isActivated ? 2.5 : isFocused ? 2.0 : 1.1;
          ctx.stroke();

          // Flow energy packet along quadratic curve equation (only visible when node is clicked/selected)
          const isSelectedNodeConnected = selectedEntityId && (src.id === selectedEntityId || tgt.id === selectedEntityId);

          if (isSelectedNodeConnected) {
            link.particleOffset = (link.particleOffset + link.particleSpeed) % 1.0;
            const t = link.particleOffset;
            const t1 = 1 - t;

            // Quadratic Bézier formula coords
            const lx = t1 * t1 * src.x + 2 * t1 * t * cx + t * t * tgt.x;
            const ly = t1 * t1 * src.y + 2 * t1 * t * cy + t * t * tgt.y;

            // Energy particle color: white glowing packets
            ctx.fillStyle = isDark ? '#ffffff' : 'rgba(15, 23, 42, 0.95)';
            ctx.shadowBlur = 4;
            ctx.shadowColor = ctx.fillStyle;

            ctx.beginPath();
            ctx.arc(lx, ly, 3.0, 0, 2 * Math.PI);
            ctx.fill();
          }
          ctx.restore();
        });

        // 5. DRAW INLINE EDGE LABELS (Hovered connections show text pills)
        links.forEach((link) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return;

          const isFocused = activeFocusedId && (src.id === activeFocusedId || tgt.id === activeFocusedId);
          if (!isFocused) return;

          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.hypot(dx, dy) || 1;
          const px = -dy / dist;
          const py = dx / dist;
          const curveHeight = Math.min(30, dist * 0.15);
          const cx = mx + px * curveHeight;
          const cy = my + py * curveHeight;

          // Label coordinates midpoint along Bézier curve at t = 0.5
          const lx = 0.25 * src.x + 0.5 * cx + 0.25 * tgt.x;
          const ly = 0.25 * src.y + 0.5 * cy + 0.25 * tgt.y;

          ctx.save();
          const fontSize = Math.max(9 / zoomRef.current, 2.2);
          ctx.font = `600 ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const labelText = link.label.toUpperCase();
          const textWidth = ctx.measureText(labelText).width;
          const padX = 4;
          const padY = 2;

          // Backdrop pill border
          ctx.fillStyle = isDark ? 'rgba(20, 21, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(lx - textWidth / 2 - padX, ly - fontSize / 2 - padY, textWidth + padX * 2, fontSize + padY * 2);

          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 0.7;
          ctx.strokeRect(lx - textWidth / 2 - padX, ly - fontSize / 2 - padY, textWidth + padX * 2, fontSize + padY * 2);

          ctx.fillStyle = '#22d3ee';
          ctx.fillText(labelText, lx, ly);
          ctx.restore();
        });

        // 6. DRAW NODES (Outer glow halo, specular inner cores, text labels)
        nodes.forEach((node) => {
          if (node.x === undefined || node.y === undefined) return;

          const isSelected = selectedEntityId === node.id;
          const isActivated = activatedNodeIds.includes(node.id);
          const isFocused = activeConnectedNodeIds.has(node.id);
          const isDimmed = activeFocusedId && !isFocused;

          ctx.save();
          ctx.globalAlpha = isDimmed ? 0.12 : 1.0;

          const radius = (isSelected ? 9.5 : isActivated ? 8.2 : 6.0) * node.scale;

          // Draw Outer Glowing Radial Halo
          if (isSelected || isActivated) {
            const glowRadius = radius * (2.8 + node.glow * 1.2);
            const grad = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, glowRadius);
            grad.addColorStop(0, isSelected ? 'rgba(108, 92, 231, 0.7)' : 'rgba(34, 211, 238, 0.45)');
            grad.addColorStop(0.5, isSelected ? 'rgba(108, 92, 231, 0.15)' : 'rgba(34, 211, 238, 0.1)');
            grad.addColorStop(1, 'transparent');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI);
            ctx.fill();

            // Pulsing connection border ring
            ctx.strokeStyle = isSelected ? '#6c5ce7' : '#22d3ee';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 4.5, 0, 2 * Math.PI);
            ctx.stroke();
          }

          // Node body core: Specular 3D Gradient
          const nodeGrad = ctx.createRadialGradient(
            node.x - radius * 0.35,
            node.y - radius * 0.35,
            0,
            node.x,
            node.y,
            radius
          );
          nodeGrad.addColorStop(0, '#ffffff');
          nodeGrad.addColorStop(0.4, node.color);
          nodeGrad.addColorStop(1, node.color);

          ctx.fillStyle = nodeGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fill();

          // High contrast boundary border ring
          ctx.strokeStyle = isSelected ? '#ffffff' : isDark ? 'rgba(13, 14, 18, 0.85)' : '#ffffff';
          ctx.lineWidth = isSelected ? 2 : 1.2;
          ctx.stroke();

          // Node Name text rendering
          const labelText = node.name;
          const fontSize = Math.max(10 / zoomRef.current, 2.5);
          ctx.font = `${isSelected ? '700' : '600'} ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Rounded translucent label background for supreme text readability
          const textWidth = ctx.measureText(labelText).width;
          const textY = node.y + radius + 4;
          const padX = 4;
          const padY = 1.5;

          ctx.fillStyle = isDark ? 'rgba(13, 14, 18, 0.8)' : 'rgba(255, 255, 255, 0.85)';
          ctx.fillRect(node.x - textWidth / 2 - padX, textY - padY, textWidth + padX * 2, fontSize + padY * 2);

          ctx.fillStyle = isSelected || isActivated ? (isDark ? '#ffffff' : 'var(--accent-purple)') : (isDark ? 'rgba(248, 250, 252, 0.95)' : 'rgba(15, 23, 42, 0.95)');
          ctx.fillText(labelText, node.x, textY);

          ctx.restore();
        });

        ctx.restore(); // Restore global context coordinates transform

        animId = requestAnimationFrame(frame);
      };

      animId = requestAnimationFrame(frame);

      return () => cancelAnimationFrame(animId);
    }, [dimensions, isDark, selectedEntityId, activatedNodeIds]);

    // Handle Drag, Pan and Zoom gestures in Canvas coordinate world
    const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const mousePos = getCanvasMousePos(e);
      mousePosRef.current = mousePos;

      // Translate mouse coordinates to local world simulation space
      const worldX = (mousePos.x - pan.x) / zoom;
      const worldY = (mousePos.y - pan.y) / zoom;

      // Check if mouse is hovering on any Node entity (checking touchable threshold)
      const hitNode = nodesRef.current.find((n) => {
        const dist = Math.hypot(n.x - worldX, n.y - worldY);
        return dist < Math.max((n.radius || 8) * 2.2, 28);
      });

      if (hitNode) {
        // Drag node mode
        activeDragNodeIdRef.current = hitNode.id;
        hitNode.isDragging = true;
        onSelectEntity(hitNode.rawEntity);
      } else {
        // Pan workspace mode
        isPanningRef.current = true;
        panStartRef.current = {
          x: mousePos.x - pan.x,
          y: mousePos.y - pan.y,
        };
      }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const mousePos = getCanvasMousePos(e);
      mousePosRef.current = mousePos;

      if (activeDragNodeIdRef.current) {
        // Dragging physics
        const activeNode = nodesRef.current.find((n) => n.id === activeDragNodeIdRef.current);
        if (activeNode) {
          const worldX = (mousePos.x - panRef.current.x) / zoomRef.current;
          const worldY = (mousePos.y - panRef.current.y) / zoomRef.current;
          activeNode.x = worldX;
          activeNode.y = worldY;
        }
      } else if (isPanningRef.current) {
        // Panning view offset coordinate calculation
        const newPanX = mousePos.x - panStartRef.current.x;
        const newPanY = mousePos.y - panStartRef.current.y;
        setPan({ x: newPanX, y: newPanY });
      }
    };

    const handleMouseUpOrLeave = () => {
      if (activeDragNodeIdRef.current) {
        const draggedNode = nodesRef.current.find((n) => n.id === activeDragNodeIdRef.current);
        if (draggedNode) {
          draggedNode.isDragging = false;
        }
        activeDragNodeIdRef.current = null;
      }
      isPanningRef.current = false;
    };

    // Touch events for full mobile gesture responsiveness
    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length !== 1) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      const touchX = clientX - rect.left;
      const touchY = clientY - rect.top;
      mousePosRef.current = { x: touchX, y: touchY };

      const worldX = (touchX - pan.x) / zoom;
      const worldY = (touchY - pan.y) / zoom;

      const hitNode = nodesRef.current.find((n) => {
        const dist = Math.hypot(n.x - worldX, n.y - worldY);
        return dist < Math.max((n.radius || 8) * 2.2, 28);
      });

      if (hitNode) {
        activeDragNodeIdRef.current = hitNode.id;
        hitNode.isDragging = true;
        onSelectEntity(hitNode.rawEntity);
      } else {
        isPanningRef.current = true;
        panStartRef.current = {
          x: touchX - pan.x,
          y: touchY - pan.y,
        };
      }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length !== 1) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      const touchX = clientX - rect.left;
      const touchY = clientY - rect.top;
      mousePosRef.current = { x: touchX, y: touchY };

      if (activeDragNodeIdRef.current) {
        const activeNode = nodesRef.current.find((n) => n.id === activeDragNodeIdRef.current);
        if (activeNode) {
          activeNode.x = (touchX - panRef.current.x) / zoomRef.current;
          activeNode.y = (touchY - panRef.current.y) / zoomRef.current;
        }
      } else if (isPanningRef.current) {
        setPan({
          x: touchX - panStartRef.current.x,
          y: touchY - panStartRef.current.y,
        });
      }
    };

    // Zoom mouse wheel multiplier
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomFactor = 1.05;
      const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
      const boundedZoom = Math.max(Math.min(nextZoom, 3.0), 0.25);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Focus zoom scale onto cursor coordinate target
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      setZoom(boundedZoom);
      setPan({
        x: mouseX - worldX * boundedZoom,
        y: mouseY - worldY * boundedZoom,
      });
    };

    const bgStyle = isDark
      ? { background: 'var(--bg-base)' }
      : { background: 'var(--bg-base)' };

    // Empty / Loading state
    if (!data || data.entities.length === 0) {
      return (
        <div
          ref={containerRef}
          className={`w-full h-full relative flex items-center justify-center overflow-hidden ${isDark ? 'dot-grid-dark' : 'dot-grid-light'}`}
          style={bgStyle}
        >
          <div
            className="relative z-0 text-center space-y-4 p-8 max-w-sm rounded-2xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
              style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.3)' }}
            >
              {isLoading ? (
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--accent-purple)' }} />
              ) : (
                <Network className="w-7 h-7" style={{ color: 'var(--accent-purple)' }} />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {isLoading ? 'Constructing Knowledge Graph…' : 'Graph Canvas Ready'}
              </h3>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {isLoading
                  ? 'Gemini is extracting entities, relationships, and layer mappings…'
                  : 'Ingest a document or paste text to populate the Cortex knowledge graph.'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={`w-full h-full relative overflow-hidden ${isDark ? 'dot-grid-dark' : 'dot-grid-light'}`}
        style={bgStyle}
      >
        {/* ── Floating Bento Control Bar ── */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          {/* Search + Filter bar */}
          <div
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{
              background: 'rgba(20,21,26,0.9)',
              border: '1px solid var(--border-default)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter nodes…"
              className="bg-transparent text-xs outline-none w-24"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="flex items-center gap-1 text-xs transition-all"
              style={{ color: showFilter ? 'var(--accent-purple)' : 'var(--text-muted)' }}
            >
              <Filter className="w-3 h-3" />
              {selectedTypeFilter !== 'ALL' && (
                <span className="text-[10px] font-mono font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                  {selectedTypeFilter}
                </span>
              )}
            </button>
          </div>

          {/* Filter dropdown */}
          {showFilter && availableTypes.length > 0 && (
            <div
              className="absolute top-12 left-4 pointer-events-auto rounded-xl py-1 min-w-[140px] z-20"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {['ALL', ...availableTypes].map((type) => (
                <button
                  key={type}
                  onClick={() => { onFilterChange(type); setShowFilter(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs transition-all"
                  style={{
                    background: selectedTypeFilter === type ? 'var(--accent-purple-dim)' : 'transparent',
                    color: selectedTypeFilter === type ? 'var(--accent-purple)' : 'var(--text-secondary)',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          {/* Zoom controls */}
          <div
            className="pointer-events-auto flex items-center gap-0.5 p-1 rounded-xl"
            style={{
              background: 'rgba(20,21,26,0.9)',
              border: '1px solid var(--border-default)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <button
              onClick={() => setZoom((z) => Math.min(z * 1.3, 3))}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{ color: 'var(--text-muted)' }}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z / 1.3, 0.25))}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{ color: 'var(--text-muted)' }}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={recenterLayout}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{ color: 'var(--text-muted)' }}
              title="Recenter"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                style={{ color: isFullscreen ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Graphic Interactive Canvas ── */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUpOrLeave}
          onWheel={handleWheel}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        />

        {/* ── Canvas Footer with Category Legend ── */}
        <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold"
              style={{
                background: 'rgba(20,21,26,0.85)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: 'var(--accent-cyan)' }} />
              CORTEX NEURAL SIMULATOR
            </div>
            {simNodes.length > 0 && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold"
                style={{
                  background: 'rgba(20,21,26,0.85)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-dim)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {simNodes.length} Nodes · {simLinks.length} Edges
              </div>
            )}
          </div>

          {/* Node Category Legend Pill */}
          <div
            className="flex items-center gap-2.5 px-3 py-1 rounded-lg text-[10px] font-mono backdrop-blur-md"
            style={{
              background: 'rgba(20,21,26,0.85)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#38bdf8' }} /> Person</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#c084fc' }} /> Technology</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} /> Database</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#f472b6' }} /> Concept</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#fbbf24' }} /> Organization</span>
          </div>
        </div>
      </div>
    );
  }
);
