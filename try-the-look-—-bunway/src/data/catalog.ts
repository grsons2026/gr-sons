export type StoreCategory = 'all' | 'shirts' | 'waistcoats-coats' | 'trousers' | 'shoes';

export interface StoreCategoryDef {
  id: StoreCategory;
  label: string;
}

export const STORE_CATEGORIES: StoreCategoryDef[] = [
  { id: 'all', label: 'All' },
  { id: 'shirts', label: 'Shirts' },
  { id: 'waistcoats-coats', label: 'Waistcoats & Coats' },
  { id: 'trousers', label: 'Trousers' },
  { id: 'shoes', label: 'Shoes' },
];

export interface VariantDef {
  id: number;
  a: boolean;
  o: string[];
}

export interface CatalogItem {
  id: string;
  name: string;
  vendor: string;
  category: 'tops' | 'bottoms' | 'footwear';
  storeCategory: Exclude<StoreCategory, 'all'>;
  type: string;
  price: number;
  image: string;
  width: number;
  height: number;
  mobileWidth: number;
  mobileHeight: number;
  optionName: string;
  sizes: string[];
  variants: VariantDef[];
  url: string;
}

export interface LookPin {
  num: number;
  productId: string;
  productName: string;
  left: number;
  top: number;
}

export interface CustomLookPiece {
  id: string;
  name: string;
  price: number;
  image: string;
  vendor?: string;
  storeCategory: Exclude<StoreCategory, 'all'>;
}

export interface LookPieceRef {
  num: number;
  productId: string;
  tag?: string;
  mode?: 'linked' | 'custom';
  customItem?: CustomLookPiece;
}

export interface RunwayLook {
  index: number;
  key: string;
  name: string;
  description: string;
  model640: string;
  model1080: string;
  modelScale?: number;
  showInThisLook?: boolean;
  piecesLabel: string;
  pieces: LookPieceRef[];
  pins: LookPin[];
}

export interface HeroBannerConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  ctaPrimary: string;
  ctaSecondary: string;
  brandNote: string;
}

export const RUNWAY_SOURCE_URL = 'https://nike-makknzjs.myshopify.com/pages/runway';

export const DEFAULT_HERO_BANNER: HeroBannerConfig = {
  brandNote: 'Flagship Atelier · Bespoke Menswear',
  eyebrow: 'AUTUMN / WINTER COLLECTION',
  title: 'CRAFTED FOR THE MODERN GENTLEMAN',
  subtitle:
    'Bespoke tailored suits, structured wool coats, crisp Egyptian cotton dress shirts, and handcrafted burnished leather footwear displayed in warm architectural light.',
  image: '/src/assets/images/luxury_atelier_hero_1795019587863.jpg',
  ctaPrimary: 'EXPLORE COLLECTION',
  ctaSecondary: '3D VIRTUAL RUNWAY',
};

export function makeVariantsForCategory(
  storeCategory: Exclude<StoreCategory, 'all'>,
  baseId: number
): {
  category: 'tops' | 'bottoms' | 'footwear';
  optionName: string;
  sizes: string[];
  variants: VariantDef[];
} {
  if (storeCategory === 'trousers') {
    const sizes = ['28', '30', '32', '34'];
    return {
      category: 'bottoms',
      optionName: 'Waist size',
      sizes,
      variants: sizes.map((size, idx) => ({ id: baseId + idx, a: true, o: [size] })),
    };
  }
  if (storeCategory === 'shoes') {
    const sizes = ['40', '41', '42', '43', '44', '45', '46'];
    return {
      category: 'footwear',
      optionName: 'Shoe size',
      sizes,
      variants: sizes.map((size, idx) => ({ id: baseId + idx, a: true, o: [size] })),
    };
  }
  const sizes = ['S', 'M', 'L', 'XL'];
  return {
    category: 'tops',
    optionName: 'Size',
    sizes,
    variants: sizes.map((size, idx) => ({ id: baseId + idx, a: true, o: [size] })),
  };
}

function makeApparelVariants(baseId: number): VariantDef[] {
  return ['S', 'M', 'L', 'XL'].map((size, idx) => ({
    id: baseId + idx,
    a: true,
    o: [size],
  }));
}

function makeTrouserVariants(baseId: number): VariantDef[] {
  return ['28', '30', '32', '34'].map((size, idx) => ({
    id: baseId + idx,
    a: true,
    o: [size],
  }));
}

function makeShoeVariants(baseId: number): VariantDef[] {
  return ['40', '41', '42', '43', '44', '45', '46'].map((size, idx) => ({
    id: baseId + idx,
    a: true,
    o: [size],
  }));
}

export const DEFAULT_CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'atelier-dress-shirt',
    name: 'Crisp Poplin Dress Shirt',
    vendor: 'Nike Atelier',
    category: 'tops',
    storeCategory: 'shirts',
    type: 'Atelier Layer 01 · Shirts',
    price: 16500,
    image: '/src/assets/images/pure_dress_shirt_1795111355320.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(582010100),
    url: '#quickview-atelier-dress-shirt',
  },
  {
    id: 'atelier-navy-waistcoat',
    name: 'Tailored Navy Wool Waistcoat',
    vendor: 'Nike Atelier',
    category: 'tops',
    storeCategory: 'waistcoats-coats',
    type: 'Atelier Layer 02 · Waistcoats & Coats',
    price: 22000,
    image: '/src/assets/images/pure_navy_waistcoat_1795111355975.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(582010200),
    url: '#quickview-atelier-navy-waistcoat',
  },
  {
    id: 'atelier-blazer-coat',
    name: 'Bespoke Blazer Coat & Burgundy Tie',
    vendor: 'Nike Atelier',
    category: 'tops',
    storeCategory: 'waistcoats-coats',
    type: 'Atelier Layer 05 · Waistcoats & Coats',
    price: 49500,
    image: '/src/assets/images/pure_blazer_coat_1795111355935.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(582010300),
    url: '#quickview-atelier-blazer-coat',
  },
  {
    id: 'look-1-top',
    name: 'Charcoal Ribbed Knit Sweater',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'waistcoats-coats',
    type: 'From Look 01 · The City Edit',
    price: 19900,
    image: '/src/assets/images/pure_charcoal_sweater_1795111355630.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581010100),
    url: '#quickview-look-1-top',
  },
  {
    id: 'look-1-pants',
    name: 'Mid-Wash Baggy Denim',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 01 · The City Edit',
    price: 19900,
    image: '/src/assets/images/pure_midwash_denim_1795111356208.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581010200),
    url: '#quickview-look-1-pants',
  },
  {
    id: 'look-1-shoes',
    name: 'Grey Mesh Retro Runners',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 01 · The City Edit',
    price: 14900,
    image: '/src/assets/images/pure_grey_runners_1795111355879.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581010300),
    url: '#quickview-look-1-shoes',
  },
  {
    id: 'look-2-top',
    name: 'Heavyweight White Boxy Tee',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'shirts',
    type: 'From Look 02 · Gallery Opening',
    price: 19900,
    image: '/src/assets/images/pure_boxy_tee_1795111355217.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581020100),
    url: '#quickview-look-2-top',
  },
  {
    id: 'look-2-pants',
    name: 'Vintage Washed Wide Denim',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 02 · Gallery Opening',
    price: 19900,
    image: '/src/assets/images/pure_vintage_denim_1795111355214.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581020200),
    url: '#quickview-look-2-pants',
  },
  {
    id: 'look-2-shoes',
    name: 'Black & Cream Low Sneakers',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 02 · Gallery Opening',
    price: 14900,
    image: '/src/assets/images/pure_black_sneakers_1795111355810.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581020300),
    url: '#quickview-look-2-shoes',
  },
  {
    id: 'look-3-top',
    name: 'Olive Fisherman Knit Sweater',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'waistcoats-coats',
    type: 'From Look 03 · Gallery Opening',
    price: 19900,
    image: '/src/assets/images/pure_olive_sweater_1795111354830.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581030100),
    url: '#quickview-look-3-top',
  },
  {
    id: 'look-3-pants',
    name: 'Espresso Wide Corduroy Trousers',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 03 · Gallery Opening',
    price: 19900,
    image: '/src/assets/images/pure_corduroy_pants_1795111356171.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581030200),
    url: '#quickview-look-3-pants',
  },
  {
    id: 'look-3-shoes',
    name: 'Tan Suede Trail Shoes',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 03 · Gallery Opening',
    price: 14900,
    image: '/src/assets/images/pure_trail_shoes_1795111355385.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581030300),
    url: '#quickview-look-3-shoes',
  },
  {
    id: 'look-4-top',
    name: 'Jet Black Oversized Tee',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'shirts',
    type: 'From Look 04 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_black_tee_1795111354528.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581040100),
    url: '#quickview-look-4-top',
  },
  {
    id: 'look-4-pants',
    name: 'Ice-Wash Baggy Denim',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 04 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_icewash_denim_1795111355697.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581040200),
    url: '#quickview-look-4-pants',
  },
  {
    id: 'look-4-shoes',
    name: 'Triple White Court Sneakers',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 04 · Studio Day',
    price: 14900,
    image: '/src/assets/images/pure_white_sneakers_1795111354964.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581040300),
    url: '#quickview-look-4-shoes',
  },
  {
    id: 'look-5-top',
    name: 'Rust-Brown Ribbed Knit Sweater',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'waistcoats-coats',
    type: 'From Look 05 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_rust_sweater_1795111354738.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581050100),
    url: '#quickview-look-5-top',
  },
  {
    id: 'look-5-pants',
    name: 'Washed Charcoal Baggy Jeans',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 05 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_charcoal_jeans_1795111355578.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581050200),
    url: '#quickview-look-5-pants',
  },
  {
    id: 'look-5-shoes',
    name: 'Matte Black Leather Sneakers',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 05 · Studio Day',
    price: 14900,
    image: '/src/assets/images/pure_leather_sneakers_1795111355561.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581050300),
    url: '#quickview-look-5-shoes',
  },
  {
    id: 'look-6-top',
    name: 'Heather Grey Fleece Crewneck',
    vendor: 'Nike',
    category: 'tops',
    storeCategory: 'shirts',
    type: 'From Look 06 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_grey_crewneck_1795111355331.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Size',
    sizes: ['S', 'M', 'L', 'XL'],
    variants: makeApparelVariants(581060100),
    url: '#quickview-look-6-top',
  },
  {
    id: 'look-6-pants',
    name: 'Acid-Wash Wide Denim',
    vendor: 'Nike',
    category: 'bottoms',
    storeCategory: 'trousers',
    type: 'From Look 06 · Studio Day',
    price: 19900,
    image: '/src/assets/images/pure_acidwash_denim_1795111356085.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Waist size',
    sizes: ['28', '30', '32', '34'],
    variants: makeTrouserVariants(581060200),
    url: '#quickview-look-6-pants',
  },
  {
    id: 'look-6-shoes',
    name: 'Off-White Retro Court Sneakers',
    vendor: 'Nike',
    category: 'footwear',
    storeCategory: 'shoes',
    type: 'From Look 06 · Studio Day',
    price: 14900,
    image: '/src/assets/images/pure_cream_sneakers_1795111355462.jpg',
    width: 400,
    height: 533,
    mobileWidth: 160,
    mobileHeight: 213,
    optionName: 'Shoe size',
    sizes: ['40', '41', '42', '43', '44', '45', '46'],
    variants: makeShoeVariants(581060300),
    url: '#quickview-look-6-shoes',
  },
];

export const DEFAULT_LOOKS: RunwayLook[] = [
  {
    index: 0,
    key: 'bndthK',
    name: 'The City Edit',
    description: 'A charcoal knit and easy denim.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-1-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-1.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-1-top' },
      { num: 2, productId: 'look-1-pants' },
      { num: 3, productId: 'look-1-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-1-top', productName: 'Charcoal Ribbed Knit Sweater', left: 48, top: 28 },
      { num: 2, productId: 'look-1-pants', productName: 'Mid-Wash Baggy Denim', left: 48, top: 58 },
      { num: 3, productId: 'look-1-shoes', productName: 'Grey Mesh Retro Runners', left: 46, top: 92 },
    ],
  },
  {
    index: 1,
    key: 'XckgG6',
    name: 'Gallery Opening',
    description: 'A clean white tee and relaxed denim.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-5-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-5.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-2-top' },
      { num: 2, productId: 'look-2-pants', tag: 'New' },
      { num: 3, productId: 'look-2-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-2-top', productName: 'Heavyweight White Boxy Tee', left: 49, top: 28 },
      { num: 2, productId: 'look-2-pants', productName: 'Vintage Washed Wide Denim', left: 48, top: 58 },
      { num: 3, productId: 'look-2-shoes', productName: 'Black & Cream Low Sneakers', left: 46, top: 91 },
    ],
  },
  {
    index: 2,
    key: 'rLfAhC',
    name: 'Gallery Opening',
    description: 'Olive knitwear. A grounded palette.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-4-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-4.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-3-top' },
      { num: 2, productId: 'look-3-pants', tag: 'New' },
      { num: 3, productId: 'look-3-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-3-top', productName: 'Olive Fisherman Knit Sweater', left: 50, top: 28 },
      { num: 2, productId: 'look-3-pants', productName: 'Espresso Wide Corduroy Trousers', left: 48, top: 58 },
      { num: 3, productId: 'look-3-shoes', productName: 'Tan Suede Trail Shoes', left: 46, top: 91 },
    ],
  },
  {
    index: 3,
    key: 'FKg67q',
    name: 'Studio Day',
    description: 'Black, white and laid-back denim.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-6-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-6.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-4-top' },
      { num: 2, productId: 'look-4-pants' },
      { num: 3, productId: 'look-4-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-4-top', productName: 'Jet Black Oversized Tee', left: 50, top: 28 },
      { num: 2, productId: 'look-4-pants', productName: 'Ice-Wash Baggy Denim', left: 48, top: 58 },
      { num: 3, productId: 'look-4-shoes', productName: 'Triple White Court Sneakers', left: 46, top: 91 },
    ],
  },
  {
    index: 4,
    key: '8KREEE',
    name: 'Studio Day',
    description: 'Rust-brown knitwear and charcoal denim.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-3-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-3.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-5-top' },
      { num: 2, productId: 'look-5-pants' },
      { num: 3, productId: 'look-5-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-5-top', productName: 'Rust-Brown Ribbed Knit Sweater', left: 50, top: 28 },
      { num: 2, productId: 'look-5-pants', productName: 'Washed Charcoal Baggy Jeans', left: 48, top: 58 },
      { num: 3, productId: 'look-5-shoes', productName: 'Matte Black Leather Sneakers', left: 46, top: 91 },
    ],
  },
  {
    index: 5,
    key: 'N3bfm9',
    name: 'Studio Day',
    description: 'A grey crew and your favourite denim.',
    model640: 'https://reel-ref-try-the-look.vercel.app/assets/model-2-640.webp',
    model1080: 'https://reel-ref-try-the-look.vercel.app/assets/original-look-2.webp',
    piecesLabel: '3 pieces',
    pieces: [
      { num: 1, productId: 'look-6-top' },
      { num: 2, productId: 'look-6-pants' },
      { num: 3, productId: 'look-6-shoes' },
    ],
    pins: [
      { num: 1, productId: 'look-6-top', productName: 'Heather Grey Fleece Crewneck', left: 50, top: 29 },
      { num: 2, productId: 'look-6-pants', productName: 'Acid-Wash Wide Denim', left: 48, top: 61 },
      { num: 3, productId: 'look-6-shoes', productName: 'Off-White Retro Court Sneakers', left: 46, top: 91 },
    ],
  },
];

export const CATALOG_ITEMS: CatalogItem[] = DEFAULT_CATALOG_ITEMS;
export const LOOKS: RunwayLook[] = DEFAULT_LOOKS;

export const ITEM_BY_ID = new Map<string, CatalogItem>(
  CATALOG_ITEMS.map((item) => [item.id, item])
);

export function formatMoney(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  return `PKR ${rounded.toLocaleString('en-US')}`;
}
