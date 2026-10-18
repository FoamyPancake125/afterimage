import type { DeviceClass } from '../../engine/index.ts'

/**
 * Drawn marks rather than borrowed glyphs. Each one is a schematic of what the
 * device actually is, so the eight rows in the Ring panel can be told apart at
 * a glance without reading the model names.
 */
export function DeviceIcon({ deviceClass }: { deviceClass: DeviceClass }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (deviceClass) {
    case 'doorbell':
      return (
        <svg {...common}>
          <rect x="4.5" y="1.8" width="7" height="12.4" rx="3.3" />
          <circle cx="8" cy="5.6" r="1.5" />
          <circle cx="8" cy="11" r="1.1" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common}>
          <path d="M2 5.2h7.4v5.6H2z" />
          <path d="M9.4 7.4 14 5.2v5.6L9.4 8.6z" />
        </svg>
      )
    case 'indoor_camera':
      return (
        <svg {...common}>
          <circle cx="8" cy="7" r="3.4" />
          <circle cx="8" cy="7" r="1.1" />
          <path d="M5.4 12.8h5.2" />
        </svg>
      )
    case 'contact':
      return (
        <svg {...common}>
          <path d="M2.4 2.6h4.3v10.8H2.4z" />
          <path d="M9.3 2.6h4.3v10.8H9.3z" />
          <path d="M7.6 8h0.8" />
        </svg>
      )
    case 'motion':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="1.3" />
          <path d="M4.5 5.1a4.6 4.6 0 0 0 0 5.8M11.5 5.1a4.6 4.6 0 0 1 0 5.8" />
          <path d="M2.3 3.1a7.6 7.6 0 0 0 0 9.8M13.7 3.1a7.6 7.6 0 0 1 0 9.8" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <rect x="3.2" y="7" width="9.6" height="7" rx="1.2" />
          <path d="M5.6 7V4.9a2.4 2.4 0 0 1 4.8 0V7" />
          <path d="M8 9.7v1.8" />
        </svg>
      )
  }
}
