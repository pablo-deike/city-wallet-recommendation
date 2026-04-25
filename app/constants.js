export const C = {
  navy:    '#1B2A4A',
  navyDim: '#2D3F61',
  amber:   '#F5A623',
  bg:      '#F0F2F5',
  white:   '#FFFFFF',
  gray:    '#6B7280',
  light:   '#E5E7EB',
  success: '#10B981',
  danger:  '#EF4444',
};

export const cardStyle = {
  background: 'white',
  borderRadius: 16,
  padding: '16px',
  boxShadow: '0 2px 14px rgba(27,42,74,0.08)',
};

export const QR_GRID = (() => {
  const SIZE = 25;
  let seed = 0xabcd1234;
  const rand = () => {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    return ((seed >>> 16) & 1) === 1;
  };
  const grid = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => rand())
  );
  const drawFinder = (ro, co) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[ro + r][co + c] = border || center;
      }
    }
    for (let i = 0; i < 8; i++) {
      if (ro + 7 < SIZE && co + i < SIZE) grid[ro + 7][co + i] = false;
      if (ro + i < SIZE && co + 7 < SIZE) grid[ro + i][co + 7] = false;
    }
  };
  drawFinder(0, 0);
  drawFinder(0, SIZE - 7);
  drawFinder(SIZE - 7, 0);
  for (let i = 8; i < SIZE - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }
  return grid;
})();

export const OFFER_FEED = [
  { time: '12:41', offer: '15% off any hot drink',  status: 'Accepted', dist: '80m'  },
  { time: '12:38', offer: '10% off lunch special',  status: 'Declined', dist: '150m' },
  { time: '12:35', offer: '20% off pastry + drink', status: 'Accepted', dist: '45m'  },
  { time: '12:29', offer: '15% off any hot drink',  status: 'Pending',  dist: '120m' },
  { time: '12:22', offer: '10% off any purchase',   status: 'Accepted', dist: '60m'  },
];

export const STATUS_STYLE = {
  Accepted: { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  Declined: { bg: '#FFF1F2', text: '#E11D48', border: '#FECDD3' },
  Pending:  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
};
