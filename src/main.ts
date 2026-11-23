import './styles/runway.css';
import { AdminPanel } from './components/adminPanel.ts';
import { StylingBag } from './components/bag.ts';
import { CatalogGrid } from './components/catalogGrid.ts';
import { QuickViewModal } from './components/quickView.ts';
import { RunwaySection } from './components/runwaySection.ts';
import { ShowroomAndEditorial } from './components/showroomAndEditorial.ts';
import { storeState } from './data/storeState.ts';
import { initBrandLogos } from './utils/brandLogo.ts';

function boot(): void {
  void initBrandLogos();
  const bag = new StylingBag();
  const quickView = new QuickViewModal(bag);
  const catalogGrid = new CatalogGrid(bag, quickView);
  const adminPanel = new AdminPanel();
  const showroomAndEditorial = new ShowroomAndEditorial();

  bag.setQuickViewHandler((productId, variantId) => {
    quickView.open({ productId, selectedVariantId: variantId });
  });

  if (!customElements.get('runway-section')) {
    customElements.define('runway-section', RunwaySection);
  }

  const runwayEl = document.querySelector<RunwaySection>('runway-section');
  runwayEl?.setBag(bag);
  runwayEl?.setQuickView(quickView);
  runwayEl?.setCategoryNavigator((cat) => {
    catalogGrid.setCategory(cat, true);
  });

  quickView.initDOM();
  bag.initDOM();
  catalogGrid.initDOM();
  showroomAndEditorial.initDOM();
  adminPanel.initDOM();

  void storeState.hydrate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
