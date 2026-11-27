export type StoreCategory = 'all' | string;

export type CategorySizePreset = 'apparel' | 'trousers' | 'shoes' | 'one-size';

export interface StoreCategoryDef {
  id: StoreCategory;
  label: string;
  sizePreset?: CategorySizePreset;
}

export const DEFAULT_STORE_CATEGORIES: StoreCategoryDef[] = [
  { id: 'waistcoats-coats', label: 'Waistcoats & Coats', sizePreset: 'apparel' },
  { id: 'trousers', label: 'Trousers', sizePreset: 'trousers' },
  { id: 'shirts', label: 'Shirts', sizePreset: 'apparel' },
  { id: 'shoes', label: 'Shoes', sizePreset: 'shoes' },
];

export const STORE_CATEGORIES: StoreCategoryDef[] = [
  { id: 'all', label: 'All' },
  ...DEFAULT_STORE_CATEGORIES,
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
  images?: string[];
  sku?: string;
  fabricNotes?: string;
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

export type HeroThemeId = 'obsidian' | 'navy' | 'sand';

export interface HeroSwatchDef {
  id: HeroThemeId;
  label: string;
  hex: string;
  image: string;
  accentTint: string;
}

export interface HeroSlideConfig {
  id: HeroThemeId;
  label: string;
  swatchHex: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  mobileObjectPosition?: string;
}

export const HERO_COLOR_SWATCHES: HeroSwatchDef[] = [
  {
    id: 'obsidian',
    label: 'Obsidian Black',
    hex: '#141414',
    image: '/src/assets/images/luxury_atelier_hero_1795019587863.jpg',
    accentTint: '#ecc97f',
  },
  {
    id: 'navy',
    label: 'Midnight Navy',
    hex: '#1b2a4a',
    image: '/src/assets/images/hero_midnight_navy_1795449543360.jpg',
    accentTint: '#8da9db',
  },
  {
    id: 'sand',
    label: 'Royal Sand',
    hex: '#c8b496',
    image: '/src/assets/images/hero_royal_sand_1795449543161.jpg',
    accentTint: '#e3cba6',
  },
];

export interface HeroBannerConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  ctaPrimary: string;
  ctaSecondary: string;
  brandNote: string;
  slides: HeroSlideConfig[];
}

export interface ShowroomConfig {
  eyebrow: string;
  heading: string;
  storeName: string;
  address: string;
  timings: string;
  mapEmbedUrl: string;
  directionsUrl: string;
}

export interface CloudSyncConfig {
  endpointUrl: string;
  apiKey: string;
  autoSyncOnSave: boolean;
  lastSyncedAt: string;
}

export type OrderStatus = 'Pending' | 'Dispatched' | 'Delivered';

export interface StoreOrderItem {
  productId: string;
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  storeCategory: Exclude<StoreCategory, 'all'>;
}

export interface StoreOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  items: StoreOrderItem[];
  subtotal: number;
  delivery: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface FittingAppointment {
  id: string;
  refCode: string;
  customerName: string;
  phone: string;
  preferredDate: string;
  garmentFocus: string;
  createdAt: string;
}

export const DEFAULT_STORE_WHATSAPP = '923001234567';
export const DEFAULT_ADMIN_PIN = '1234';

export interface SizeGuideApparelRow {
  size: string;
  chest: string;
  shoulder: string;
  sleeve: string;
  waist: string;
  length: string;
}

export interface SizeGuideTrouserRow {
  size: string;
  waist: string;
  hip: string;
  inseam: string;
  legOpening: string;
}

export interface SizeGuideShoeRow {
  eu: string;
  us: string;
  uk: string;
  cm: string;
}

export interface SizeGuideConfig {
  apparel: SizeGuideApparelRow[];
  trousers: SizeGuideTrouserRow[];
  shoes: SizeGuideShoeRow[];
  note: string;
}

export const DEFAULT_SIZE_GUIDE: SizeGuideConfig = {
  apparel: [
    { size: 'S', chest: '36–38 in · 91–97 cm', shoulder: '17.3 in · 44 cm', sleeve: '24.4 in · 62 cm', waist: '29–31 in', length: '28.3 in · 72 cm' },
    { size: 'M', chest: '39–41 in · 99–104 cm', shoulder: '18.1 in · 46 cm', sleeve: '25.2 in · 64 cm', waist: '31–33 in', length: '29.1 in · 74 cm' },
    { size: 'L', chest: '42–44 in · 107–112 cm', shoulder: '18.9 in · 48 cm', sleeve: '26.0 in · 66 cm', waist: '33–35 in', length: '29.9 in · 76 cm' },
    { size: 'XL', chest: '45–47 in · 114–119 cm', shoulder: '19.7 in · 50 cm', sleeve: '26.8 in · 68 cm', waist: '36–38 in', length: '30.7 in · 78 cm' },
  ],
  trousers: [
    { size: '28', waist: '29.0 in · 74 cm', hip: '38.5 in · 98 cm', inseam: '31.0 in · 79 cm', legOpening: '8.7 in · 22 cm' },
    { size: '30', waist: '31.0 in · 79 cm', hip: '40.5 in · 103 cm', inseam: '31.5 in · 80 cm', legOpening: '9.0 in · 23 cm' },
    { size: '32', waist: '33.0 in · 84 cm', hip: '42.5 in · 108 cm', inseam: '32.0 in · 81 cm', legOpening: '9.4 in · 24 cm' },
    { size: '34', waist: '35.0 in · 89 cm', hip: '44.5 in · 113 cm', inseam: '32.5 in · 83 cm', legOpening: '9.8 in · 25 cm' },
  ],
  shoes: [
    { eu: '40', us: '7', uk: '6', cm: '25.0 cm' },
    { eu: '41', us: '8', uk: '7', cm: '26.0 cm' },
    { eu: '42', us: '8.5', uk: '7.5', cm: '26.5 cm' },
    { eu: '43', us: '9.5', uk: '8.5', cm: '27.5 cm' },
    { eu: '44', us: '10', uk: '9', cm: '28.0 cm' },
    { eu: '45', us: '11', uk: '10', cm: '29.0 cm' },
    { eu: '46', us: '12', uk: '11', cm: '30.0 cm' },
  ],
  note: 'Tailored garments cut to modern proportions. Between sizes, choose the larger size for layered waistcoat and blazer comfort.',
};

export const RUNWAY_SOURCE_URL = 'https://nike-makknzjs.myshopify.com/pages/runway';

export const DEFAULT_HERO_SLIDES: HeroSlideConfig[] = [
  {
    id: 'obsidian',
    label: 'Obsidian Black',
    swatchHex: '#141414',
    image: '/src/assets/images/luxury_atelier_hero_1795019587863.jpg',
    eyebrow: 'AUTUMN / WINTER COLLECTION',
    title: 'CRAFTED FOR THE MODERN GENTLEMAN',
    subtitle:
      'Bespoke tailored suits, structured wool coats, crisp Egyptian cotton dress shirts, and handcrafted burnished leather footwear displayed in warm architectural light.',
    mobileObjectPosition: '70% 18%',
  },
  {
    id: 'navy',
    label: 'Midnight Navy',
    swatchHex: '#1b2a4a',
    image: '/src/assets/images/hero_midnight_navy_1795449543360.jpg',
    eyebrow: 'EVENING BESPOKE · MIDNIGHT NAVY',
    title: 'SHARP SILHOUETTES IN DEEP NAVY',
    subtitle:
      'Full-canvas Italian worsted wool suiting sculpted for architectural drape, subtle brass-gold finishing, and effortless formal authority.',
    mobileObjectPosition: '82% 18%',
  },
  {
    id: 'sand',
    label: 'Royal Sand',
    swatchHex: '#c8b496',
    image: '/src/assets/images/hero_royal_sand_1795449543161.jpg',
    eyebrow: 'ATELIER CAPSULE · ROYAL SAND',
    title: 'WARM CAMEL & CASHMERE HERITAGE',
    subtitle:
      'Brushed cashmere-wool overcoats, textured waistcoats, and breathable tailoring curated in sunlit warm neutrals for distinguished everyday wear.',
    mobileObjectPosition: '58% 18%',
  },
];

export const DEFAULT_HERO_BANNER: HeroBannerConfig = {
  brandNote: 'Flagship Atelier · Bespoke Menswear',
  eyebrow: DEFAULT_HERO_SLIDES[0].eyebrow,
  title: DEFAULT_HERO_SLIDES[0].title,
  subtitle: DEFAULT_HERO_SLIDES[0].subtitle,
  image: DEFAULT_HERO_SLIDES[0].image,
  ctaPrimary: 'EXPLORE COLLECTION',
  ctaSecondary: '3D VIRTUAL RUNWAY',
  slides: DEFAULT_HERO_SLIDES,
};

export const DEFAULT_SHOWROOM: ShowroomConfig = {
  eyebrow: 'Flagship Atelier · Gujranwala',
  heading: 'VISIT OUR FLAGSHIP SHOWROOM',
  storeName: "GR SON'S Flagship Showroom",
  address:
    "GR SON'S Flagship Showroom, Block Y, Main Super X Market, Opposite Al Noor Bakery, Peoples Colony, Gujranwala, 52250",
  timings: 'Mon–Sun: 11:00 AM – 10:00 PM',
  mapEmbedUrl:
    'https://maps.google.com/maps?q=GR%20SON%27S%20Flagship%20Showroom,%20Block%20Y,%20Main%20Super%20X%20Market,%20Opposite%20Al%20Noor%20Bakery,%20Peoples%20Colony,%20Gujranwala,%2052250&t=&z=16&ie=UTF8&iwloc=&output=embed',
  directionsUrl:
    'https://www.google.com/maps/dir/?api=1&destination=GR+SON%27S+Flagship+Showroom,+Block+Y,+Main+Super+X+Market,+Opposite+Al+Noor+Bakery,+Peoples+Colony,+Gujranwala,+52250',
};

export const DEFAULT_CLOUD_SYNC: CloudSyncConfig = {
  endpointUrl: 'https://api.jsonbin.io/v3/b/6b05c4e7ac6210605aa14777',
  apiKey: '$2a$10$hOO36v0BIb0dbgJyXdFiR.nOqF64lTz2D2oTpI6r.RLHsL6hwzmi.',
  autoSyncOnSave: true,
  lastSyncedAt: '',
};

export function makeVariantsForCategory(
  storeCategory: Exclude<StoreCategory, 'all'>,
  baseId: number,
  sizePreset?: CategorySizePreset
): {
  category: 'tops' | 'bottoms' | 'footwear';
  optionName: string;
  sizes: string[];
  variants: VariantDef[];
} {
  const slug = String(storeCategory || '').toLowerCase();
  const isTrousers =
    sizePreset === 'trousers' ||
    (!sizePreset &&
      (slug === 'trousers' ||
        /\b(pant|pants|trouser|trousers|chino|chinos|denim|jean|jeans|shalwar)\b/.test(slug)));

  if (isTrousers) {
    const sizes = ['28', '30', '32', '34'];
    return {
      category: 'bottoms',
      optionName: 'Waist size',
      sizes,
      variants: sizes.map((size, idx) => ({ id: baseId + idx, a: true, o: [size] })),
    };
  }

  const isShoes =
    sizePreset === 'shoes' ||
    (!sizePreset &&
      (slug === 'shoes' ||
        /\b(shoe|shoes|footwear|loafer|loafers|boot|boots|khussa|sneaker|sneakers|sandal|sandals)\b/.test(
          slug
        )));

  if (isShoes) {
    const sizes = ['40', '41', '42', '43', '44', '45', '46'];
    return {
      category: 'footwear',
      optionName: 'Shoe size',
      sizes,
      variants: sizes.map((size, idx) => ({ id: baseId + idx, a: true, o: [size] })),
    };
  }

  const isOneSize =
    sizePreset === 'one-size' ||
    (!sizePreset &&
      /\b(accessor|accessories|cufflink|cufflinks|watch|watches|belt|belts|tie|ties|pocket-square|scarf|shawl|perfume|fragrance|fragrances|wallet|wallets)\b/.test(
        slug
      ));

  if (isOneSize) {
    const sizes = ['Standard'];
    return {
      category: 'tops',
      optionName: 'Size',
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
