import type { SVGProps } from 'react';

export function AxidrawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      <line x1="12" y1="22" x2="12" y2="12" />
      <polyline points="17 8 17 3 7 3 7 8" />
      <line x1="7" y1="15" x2="17" y2="15" />
    </svg>
  );
}

export function HatchPlot3DIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 3l18 18M3 9l6 6M9 3l6 6M3 15l6 6M15 3l6 6" />
      <path d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />
    </svg>
  );
}
