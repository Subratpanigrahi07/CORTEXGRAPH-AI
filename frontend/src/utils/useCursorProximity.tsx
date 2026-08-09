import React, { useEffect, useRef, useState, useCallback } from 'react';

export function useCursorProximity<T extends HTMLElement = HTMLDivElement>(maxDistance = 220) {
  const ref = useRef<T>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const updateProximity = useCallback(
    (val: number, mouseX?: number, mouseY?: number) => {
      if (ref.current) {
        ref.current.style.setProperty('--proximity', val.toFixed(3));
        if (mouseX !== undefined) {
          ref.current.style.setProperty('--mouse-x', `${mouseX.toFixed(1)}px`);
        }
        if (mouseY !== undefined) {
          ref.current.style.setProperty('--mouse-y', `${mouseY.toFixed(1)}px`);
        }
      }
    },
    []
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      if (isHovered || isFocused) {
        updateProximity(1, relX, relY);
        return;
      }

      // Calculate distance to closest edge of bounding rectangle
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const distance = Math.hypot(dx, dy);

      if (distance < maxDistance) {
        // Smooth non-linear curve for natural approach feel
        const rawRatio = 1 - distance / maxDistance;
        const proximity = Math.pow(rawRatio, 1.25);
        updateProximity(proximity, relX, relY);
      } else {
        updateProximity(0);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [maxDistance, isHovered, isFocused, updateProximity]);

  const bindHandlers = {
    onMouseEnter: (e: React.MouseEvent) => {
      setIsHovered(true);
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        updateProximity(1, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        updateProximity(1);
      }
    },
    onMouseLeave: () => {
      setIsHovered(false);
      if (!isFocused) updateProximity(0);
    },
    onFocus: () => {
      setIsFocused(true);
      updateProximity(1);
    },
    onBlur: () => {
      setIsFocused(false);
      if (!isHovered) updateProximity(0);
    },
  };

  return {
    ref,
    isHovered,
    isFocused,
    bindHandlers,
  };
}

export const GoogleAiSparkleIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 18,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`google-ai-sparkle-icon ${className}`}
    >
      <defs>
        <linearGradient id="googleAiGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="33%" stopColor="#EA4335" />
          <stop offset="66%" stopColor="#FBBC05" />
          <stop offset="100%" stopColor="#34A853" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12 2 13.5 7.5 18 9C13.5 10.5 12 16 12 16C12 16 10.5 10.5 6 9C10.5 7.5 12 2 12 2Z"
        fill="url(#googleAiGrad)"
      />
      <path
        d="M19 15C19 15 19.8 17.8 22 18.5C19.8 19.2 19 22 19 22C19 22 18.2 19.2 16 18.5C18.2 17.8 19 15 19 15Z"
        fill="url(#googleAiGrad)"
        opacity="0.85"
      />
      <path
        d="M5 16C5 16 5.6 18.1 7.2 18.6C5.6 19.1 5 21.2 5 21.2C5 21.2 4.4 19.1 2.8 18.6C4.4 18.1 5 16 5 16Z"
        fill="url(#googleAiGrad)"
        opacity="0.7"
      />
    </svg>
  );
};
