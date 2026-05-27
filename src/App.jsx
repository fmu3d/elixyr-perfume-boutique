import { useState, useEffect } from 'react';
import './App.css';
import { 
  mockProducts, 
  mockBlogs, 
  mockDiscoverySet, 
  ADMIN_HASH, 
  MASTER_HASH,
  DEMO_HASH
} from './utils/mockData';
import { database, sanitizeUAEPhone, isValidUAEPhone } from './utils/supabaseClient';
import { integrationServices } from './utils/deliveryServices';
import logoNoBg from './assets/logo_no_bg.png';
import elixyrEmblem from './assets/elixyr_emblem.jpg';
import elixyrTag from './assets/elixyr_tag.jpg';
import logoWithBgBlack from './assets/logo_with_bg_black.jpg';
import logoWithBgCream from './assets/logo_with_bg_cream.jpg';
import bespokeOudReserve from './assets/bespoke_oud_reserve.png';
import sommelierBlotters from './assets/sommelier_blotters.png';
import ghibliPending from './assets/ghibli_pending.png';
import ghibliStockReserved from './assets/ghibli_stock_reserved.png';
import ghibliReadyForDispatch from './assets/ghibli_ready_for_dispatch.png';
import ghibliOutForDelivery from './assets/ghibli_out_for_delivery.png';
import ghibliDelivered from './assets/ghibli_delivered.png';
import ghibliCancelled from './assets/ghibli_cancelled.png';

// Standard secure SHA-256 native browser hashing helper
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Client-side auto-compression and canvas resizing engine
const compressAndProcessImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 800;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG with 80% quality (ideal premium/lightweight balance)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

function App() {
  // --- Router & History State ---
  const [currentRoute, setCurrentRoute] = useState('/');
  const [scopedProductSlug, setScopedProductSlug] = useState(null);
  const [scopedBlogSlug, setScopedBlogSlug] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [trackedOrder, setTrackedOrder] = useState(null);
  const [trackingError, setTrackingError] = useState(false);
  const [customProductCategory, setCustomProductCategory] = useState('');
  const [customBlogCategory, setCustomBlogCategory] = useState('');
  const [customEditProductCategory, setCustomEditProductCategory] = useState('');
  const [categories, setCategories] = useState(['OUD BLENDS', 'MUSK BLENDS', 'SIGNATURE EXTRAITS']);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState(null);
  const [editingCategoryInput, setEditingCategoryInput] = useState('');

  // --- Dynamic Fulfillment Statuses States ---
  const [fulfillmentStatuses, setFulfillmentStatuses] = useState(() => {
    const saved = localStorage.getItem('elixyr_fulfillment_statuses_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("⚜️ Elixyr Integration Core: Error parsing saved fulfillment statuses:", e);
      }
    }
    return [
      { key: 'pending', label: 'Received' },
      { key: 'stock_reserved', label: 'Stock Reserved' },
      { key: 'ready_for_dispatch', label: 'Ready for Dispatch' },
      { key: 'out_of_delivery', label: 'Out for Delivery' },
      { key: 'delivered', label: 'Delivered' },
      { key: 'cancelled', label: 'Cancelled / Rejected' }
    ];
  });
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [editingStatusKey, setEditingStatusKey] = useState(null);
  const [editingStatusLabel, setEditingStatusLabel] = useState('');
  const [checkoutError, setCheckoutError] = useState(null);

  // --- Dynamic Products, Blogs, & Orders State (Supabase / Local fallback synced) ---
  const [products, setProducts] = useState(() => {
    return mockProducts.map(p => {
      if (p.slug === 'bespoke-oud-reserve') {
        return { ...p, images: [logoWithBgCream, logoWithBgBlack] };
      }
      if (p.slug === 'rose-damascena') {
        return { ...p, images: [elixyrTag] };
      }
      return p;
    });
  });
  const [blogs, setBlogs] = useState(() => {
    return mockBlogs.map((b, idx) => {
      const defaultUrls = [
        'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=80&w=800'
      ];
      return {
        ...b,
        image_url: b.image_url || defaultUrls[idx % defaultUrls.length],
        extra_images: b.extra_images || []
      };
    });
  });
  const [orders, setOrders] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState({
    fullName: '',
    phone: '+971',
    email: '',
    emirate: 'Dubai (15 AED)',
    paymentMethod: 'WhatsApp Order Concierge',
    items: []
  });
  const [manualOrderError, setManualOrderError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotification, setSyncNotification] = useState(null);
  const [crmMetadata, setCrmMetadata] = useState({});
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [activeCrmClient, setActiveCrmClient] = useState(null);
  const [newVipTag, setNewVipTag] = useState('');

  useEffect(() => {
    setActiveImageIdx(0);
  }, [scopedProductSlug]);

  // --- App Theme State ---
  const [isDarkMode, setIsDarkMode] = useState(false);

  // --- Cart & Checkout States ---
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false); // Cart Drawer slider
  const [checkoutForm, setCheckoutForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    emirate: 'Dubai (15 AED)',
    paymentMethod: 'WhatsApp Order Concierge'
  });
  const [orderNumber, setOrderNumber] = useState('ELX-01007');

  // Success states (caches finalized purchases for isolated receipt printing)
  const [finalizedOrder, setFinalizedOrder] = useState(null);

  // UI state managers
  const [activeCategory, setActiveCategory] = useState('ALL FRAGRANCES');
  const [selectedBlog, setSelectedBlog] = useState(null); // Journal overlay reader
  
  // Admin dashboard states
  const [adminPasscode, setAdminPasscode] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState('overview'); // overview, products, blogs
  const [showPasscode, setShowPasscode] = useState(false);

  // --- Scent Quiz / Perfume Finder States ---
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0); // 0: Welcome, 1: Silhouette, 2: Olfactory Niche, 3: Intensity, 4: Match Revealed
  const [quizAnswers, setQuizAnswers] = useState({
    silhouette: '', // feminine, shared, masculine
    niche: '', // deep, powdery, vibrant
    intensity: '' // quiet, refined, sovereign
  });
  const [matchedProduct, setMatchedProduct] = useState(null);

  // Admin creation forms
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    category: 'OUD BLENDS',
    customCategory: '',
    isCustomCategory: false,
    price: '',
    stock_status: 'in_stock',
    scent_family: '',
    key_notes: '',
    description: '',
    scent_mixes: '',
    sillage: '80',
    longevity: '85',
    gender: '50',
    batch_details: 'Batch #026 — Handcrafted',
    scarcity_note: 'Limited Release — Unique Edition',
    images: []
  });
  
  const [newBlogForm, setNewBlogForm] = useState({
    title: '',
    category: 'BUYING GUIDE',
    customCategory: '',
    isCustomCategory: false,
    excerpt: '',
    content: '',
    image_url: '',
    extra_images: []
  });

  // Blog edit drawer state
  const [editingBlog, setEditingBlog] = useState(null);

  // --- Navigation & Routing Helpers ---
  // Secure navigation wrapper
  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    // Dispatch a synthetic popstate event to trigger router state sync
    window.dispatchEvent(new Event('popstate'));
    // Scroll page back to top for pristine transitions
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Sync route state with browser URL bar on mount and popstate (back/forward)
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      if (path === '/' || path === '') {
        setCurrentRoute('/');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else if (path === '/journal') {
        setCurrentRoute('/journal');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else if (path.startsWith('/journal/')) {
        const parts = path.split('/');
        setCurrentRoute('/journal-detail');
        setScopedProductSlug(null);
        setScopedBlogSlug(parts[2] || null);
      } else if (path === '/wanna-see-hows-your-order-doing' || path === '/track-order') {
        setCurrentRoute('/track-order');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else if (path === '/admin-portal') {
        setCurrentRoute('/admin-portal');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else if (path === '/payment-soon') {
        setCurrentRoute('/payment-soon');
      } else if (path === '/cod-soon') {
        setCurrentRoute('/cod-soon');
      } else if (path === '/privacy') {
        setCurrentRoute('/privacy');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else if (path === '/terms') {
        setCurrentRoute('/terms');
        setScopedProductSlug(null);
        setScopedBlogSlug(null);
      } else {
        // Check for specific sub-paths like /creed or /creed/admin-portal
        const cleanPath = path.substring(1); // Remove leading slash
        const parts = cleanPath.split('/');
        
        if (parts.length === 2 && parts[1] === 'admin-portal') {
          // Scoped admin portal: /product-slug/admin-portal
          setCurrentRoute('/admin-portal');
          setScopedProductSlug(parts[0]);
          setScopedBlogSlug(null);
        } else if (parts.length === 1) {
          // Product detail page: /product-slug
          setCurrentRoute('/product-detail');
          setScopedProductSlug(parts[0]);
          setScopedBlogSlug(null);
        } else {
          // Catch-all to Home
          setCurrentRoute('/');
          setScopedProductSlug(null);
          setScopedBlogSlug(null);
        }
      }
    };

    // Initial check on mount
    handleLocationChange();

    // Listen to back/forward buttons
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Fetch initial records asynchronously on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Automatically sync any local fallback orders to Supabase cloud on startup
        if (database.syncLocalOrders) {
          try {
            await database.syncLocalOrders();
          } catch (syncErr) {
            console.error("⚜️ Elixyr Integration Core: Syncing local fallback orders failed on mount:", syncErr);
          }
        }

        let dbProducts = await database.getProducts();
        // Force reseed if database local storage has outdated 8 products
        if (dbProducts.length < 20) {
          localStorage.removeItem('elixyr_products_v2');
          dbProducts = await database.getProducts();
        }
        setProducts(dbProducts);

        // Synchronize and load categories
        const savedCats = localStorage.getItem('elixyr_product_categories_v2');
        let parsedCats = ['OUD BLENDS', 'MUSK BLENDS', 'SIGNATURE EXTRAITS'];
        if (savedCats) {
          try {
            parsedCats = JSON.parse(savedCats);
          } catch (e) {
            console.error("⚜️ Elixyr Integration Core: Error parsing saved categories:", e);
          }
        }
        const productCats = dbProducts.map(p => p.category.toUpperCase());
        const mergedCats = Array.from(new Set([...parsedCats, ...productCats])).filter(Boolean);
        setCategories(mergedCats);
        localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(mergedCats));

        const dbBlogs = await database.getBlogs();
        setBlogs(dbBlogs);

        const dbOrders = await database.getOrders();
        setOrders(dbOrders);

        // Load CRM profile metadata cache from LocalStorage
        const savedCrm = localStorage.getItem('elixyr_crm_metadata_v2');
        if (savedCrm) {
          try {
            setCrmMetadata(JSON.parse(savedCrm));
          } catch (e) {
            console.error("⚜️ Elixyr Integration Core: Error parsing CRM metadata:", e);
          }
        }
      } catch (err) {
        console.error("⚜️ Elixyr Integration Core: Error retrieving records from database:", err);
      }
    };
    loadData();
  }, []);

  // Scoped admin route resolver: auto-opens editing drawer for /product-slug/admin-portal
  useEffect(() => {
    if (isAdminAuthenticated && scopedProductSlug) {
      const matched = products.find(p => p.slug === scopedProductSlug);
      if (matched) {
        setTimeout(() => {
          setEditingProduct(matched);
          setScopedProductSlug(null);
        }, 0);
      }
    }
  }, [isAdminAuthenticated, scopedProductSlug, products]);

  // --- Theme Controller ---
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  useEffect(() => {
    const body = document.body;
    if (isDarkMode) {
      body.classList.add('dark');
    } else {
      body.classList.remove('dark');
    }
  }, [isDarkMode]);

  // --- Scoped Product Finder ---
  const activeProduct = products.find(p => p.slug === scopedProductSlug) || mockProducts.find(p => p.slug === scopedProductSlug);

  // --- Cart operations ---
  const addToCart = (product) => {
    const exists = cart.find(item => item.id === product.id);
    if (exists) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
    
    // Animate temporary "Added to Cart" state
    setRecentlyAddedId(product.id);
    setTimeout(() => {
      setRecentlyAddedId(prev => prev === product.id ? null : prev);
    }, 1000);
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartQty = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  // Checkout inputs management
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCheckoutForm(prev => ({ ...prev, [name]: value }));
    setCheckoutError(null);
  };

  // Emirate delivery cost resolver
  const getDeliveryFee = () => {
    const em = checkoutForm.emirate;
    if (em.includes('Dubai')) return 15;
    if (em.includes('Abu Dhabi')) return 20;
    if (em.includes('Sharjah')) return 15;
    if (em.includes('Ajman')) return 20;
    if (em.includes('Ras Al Khaimah')) return 25;
    if (em.includes('Fujairah')) return 25;
    return 15;
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const getTotalDue = () => {
    return getSubtotal() + (cart.length > 0 ? getDeliveryFee() : 0);
  };

  // --- Secure Place Order Handlers ---
  const handlePlaceOrder = (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setCheckoutError("Please select at least one fragrance to add to your Boutique Order Slip.");
      return;
    }
    if (!checkoutForm.fullName || !checkoutForm.phone) {
      setCheckoutError("Kindly complete your Full Name and WhatsApp phone number to proceed.");
      return;
    }

    // Robust UAE Phone Number validation & sanitization
    const cleanPhone = sanitizeUAEPhone(checkoutForm.phone);
    if (!isValidUAEPhone(cleanPhone)) {
      setCheckoutError("Invalid Phone Number: Please enter a valid UAE mobile or area number (e.g. +971501234567, 0501234567, or 501234567).");
      return;
    }

    // Email validation (must be a valid email format)
    if (!checkoutForm.email) {
      setCheckoutError("Please provide your Email Address to complete the boutique slip.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(checkoutForm.email)) {
      setCheckoutError("Invalid Email: Please provide a valid email address (e.g., name@example.com).");
      return;
    }

    const subtotal = getSubtotal();
    const delivery = getDeliveryFee();
    const grandTotal = getTotalDue();
    const dateStr = new Date().toISOString().split('T')[0];

    // Cache finalized purchase states for clean PDF printout
    const finalizedReceipt = {
      orderNumber,
      date: dateStr,
      clientName: checkoutForm.fullName,
      phone: cleanPhone,
      email: checkoutForm.email,
      emirate: checkoutForm.emirate,
      paymentMethod: checkoutForm.paymentMethod,
      items: [...cart],
      subtotal,
      delivery,
      total: grandTotal
    };
    setFinalizedOrder(finalizedReceipt);

    // Insert order into the database (Supabase or Local fallback)
    database.insertOrder(finalizedReceipt).then(savedRecord => {
      console.log("⚜️ Order logged in boutique database:", savedRecord);
      database.getOrders().then(updatedOrders => setOrders(updatedOrders));
    });

    // Dynamic Route routing based on Payment selection
    const method = checkoutForm.paymentMethod;

    if (method.includes('Online Card') || method.includes('Digital Payment')) {
      // 1. Digital Payment Card Checkout
      navigateTo('/wanna-see-hows-your-order-doing'); // Route to order tracking page
      setCart([]);
    } else if (method.includes('Cash on Delivery')) {
      // 2. COD checkout
      navigateTo('/wanna-see-hows-your-order-doing'); // Route to order tracking page
      setCart([]);
    } else {
      // 3. WhatsApp VIP checkout redirect immediately
      const itemsMessage = cart.map(item => `• ${item.name} (x${item.qty}) - ${item.price * item.qty} AED`).join('%0A');
      const waText = `Hello%20Elixyr%20Luxury!%0A%0A` +
        `I%20would%20like%20to%20place%20an%20order:%0A` +
        `*Order%20ID:*%20${orderNumber}%0A` +
        `*Client:*%20${encodeURIComponent(checkoutForm.fullName)}%0A` +
        `*Phone:*%20${encodeURIComponent(cleanPhone)}%0A` +
        `*Emirate:*%20${encodeURIComponent(checkoutForm.emirate)}%0A` +
        `*Payment:*%20WhatsApp%20Concierge%0A%0A` +
        `*Fragrance%20Selection:*%0A${itemsMessage}%0A%0A` +
        `*Total%20Due:*%20${grandTotal}%20AED%0A%0A` +
        `Please%20confirm%20my%20secure%20boutique%20delivery.%20Thank%20you!`;
      
      const waLink = `https://wa.me/+971501234567?text=${waText}`;

      // Open WhatsApp VIP gateway
      window.open(waLink, '_blank');

      // Sync and move to order updates tracking page
      navigateTo('/wanna-see-hows-your-order-doing');
      setCart([]);
    }

    // Increment tracking count
    const match = orderNumber.match(/\d+/);
    if (match) {
      const nextNum = parseInt(match[0]) + 1;
      setOrderNumber(`ELX-0${nextNum}`);
    }

    // Reset Checkout Inputs
    setCheckoutForm({
      fullName: '',
      email: '',
      phone: '',
      emirate: 'Dubai (15 AED)',
      paymentMethod: 'WhatsApp Order Concierge'
    });
  };

  // --- Cryptographically Secure Admin Portal Auth ---
  const handleAdminAuth = async (e) => {
    e.preventDefault();
    const enteredHash = await sha256(adminPasscode);
    
    if (enteredHash === ADMIN_HASH || enteredHash === MASTER_HASH || enteredHash === DEMO_HASH) {
      setIsAdminAuthenticated(true);
      if (scopedProductSlug) {
        setAdminActiveTab('products');
      } else {
        setAdminActiveTab('overview');
      }
      setAdminPasscode('');
      setShowPasscode(false); // Reset visibility state
    } else {
      alert("Security Authentication Failed: Invalid Passcode.");
      setAdminPasscode('');
    }
  };

  // Compile unique VIP customer profiles from current orders registry
  const compileClientProfiles = () => {
    const clientsMap = {};
    
    orders.forEach(o => {
      // Create a unique key using cleaned client name and phone number
      const cleanPhone = sanitizeUAEPhone(o.phone) || o.phone || '';
      const key = `${o.client_name.toLowerCase().trim()}_${cleanPhone.replace(/\+/g, '')}`;
      
      // Calculate order total value (amount)
      let amount = parseFloat(o.total_amount) || 0;
      
      // Determine scent families purchased
      const itemsList = Array.isArray(o.items) ? o.items : [];
      const purchasedProductIds = itemsList.map(i => i.id);
      
      if (!clientsMap[key]) {
        clientsMap[key] = {
          name: o.client_name,
          phone: cleanPhone,
          email: o.email || 'No Email Logged',
          totalSpent: 0,
          ordersCount: 0,
          ordersList: [],
          purchasedIds: [],
          lastActive: o.created_at || new Date().toISOString(),
          id: key
        };
      }
      
      clientsMap[key].totalSpent += amount;
      clientsMap[key].ordersCount += 1;
      clientsMap[key].ordersList.push(o);
      clientsMap[key].purchasedIds.push(...purchasedProductIds);
      
      if (new Date(o.created_at || 0) > new Date(clientsMap[key].lastActive)) {
        clientsMap[key].lastActive = o.created_at;
      }
    });

    // Map profiles and append their metadata (Staff notes and VIP Tags) from localized state
    return Object.values(clientsMap).map(c => {
      // Find matching metadata from local storage / memory state
      const meta = crmMetadata[c.phone] || crmMetadata[c.name] || {};
      
      // Preferred Category analysis
      let favoriteCategory = 'None Yet';
      if (c.purchasedIds.length > 0) {
        // Count categories
        const catCounts = {};
        c.purchasedIds.forEach(id => {
          const prod = products.find(p => p.id === id);
          if (prod) {
            catCounts[prod.category] = (catCounts[prod.category] || 0) + 1;
          }
        });
        // Find top category
        let max = 0;
        Object.entries(catCounts).forEach(([cat, count]) => {
          if (count > max) {
            max = count;
            favoriteCategory = cat;
          }
        });
      }

      // Spend tier status
      let membership = 'BRONZE DISCOVERER';
      if (c.totalSpent >= 1000) {
        membership = 'PLATINUM VIP CONNOISSEUR';
      } else if (c.totalSpent >= 500) {
        membership = 'GOLD ELITE MEMBER';
      } else if (c.totalSpent >= 250) {
        membership = 'SILVER VIP MEMBER';
      }

      return {
        ...c,
        staffNotes: meta.staffNotes || '',
        vipTags: meta.vipTags || [],
        favoriteCategory,
        membership
      };
    });
  };

  const handleSaveCrmMetadata = (phoneKey, updatedNotes, updatedTags) => {
    const updated = {
      ...crmMetadata,
      [phoneKey]: {
        staffNotes: updatedNotes,
        vipTags: updatedTags
      }
    };
    setCrmMetadata(updated);
    localStorage.setItem('elixyr_crm_metadata_v2', JSON.stringify(updated));
    
    // Show premium visual feedback
    setSyncNotification({ type: 'success', message: '⚜️ VIP CRM profile saved locally & queued for Supabase sync.' });
    setTimeout(() => setSyncNotification(null), 3000);
  };

  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncNotification({ type: 'info', message: '⚜️ Connecting to Supabase Cloud & syncing fallback orders...' });
    
    try {
      const result = await database.syncLocalOrders();
      if (result.success) {
        // Re-load the database orders to refresh the UI registry
        const dbOrders = await database.getOrders();
        setOrders(dbOrders);

        if (result.syncedCount > 0) {
          setSyncNotification({ 
            type: 'success', 
            message: `⚜️ Sync Completed: Successfully uploaded ${result.syncedCount} fallback order(s) to Supabase!` 
          });
        } else {
          setSyncNotification({ 
            type: 'success', 
            message: '⚜️ Sync Completed: Cloud database is fully up-to-date. No unsynced records.' 
          });
        }
      } else {
        setSyncNotification({ 
          type: 'error', 
          message: `⚠️ Sync Failed: ${result.reason || 'Cloud database offline.'}` 
        });
      }
    } catch (err) {
      console.error("Manual Force Sync error:", err);
      setSyncNotification({ 
        type: 'error', 
        message: '⚠️ Sync Failed: Critical connection or database exception.' 
      });
    } finally {
      setIsSyncing(false);
      // Auto-clear notification after 5 seconds
      setTimeout(() => {
        setSyncNotification(null);
      }, 5000);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    navigateTo('/');
  };

  // --- Admin Product CRUD handlers ---
  const handleCreateProduct = (e) => {
    e.preventDefault();
    const resolvedCategory = newProductForm.isCustomCategory && newProductForm.customCategory.trim()
      ? newProductForm.customCategory.trim().toUpperCase()
      : newProductForm.category;
    const validImages = newProductForm.images.filter(url => url.trim() !== '');
    const newProd = {
      id: `prod-${Date.now()}`,
      name: newProductForm.name,
      slug: newProductForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: resolvedCategory,
      price: parseFloat(newProductForm.price),
      stock_status: newProductForm.stock_status,
      stock_quantity: 10,
      scent_family: newProductForm.scent_family,
      key_notes: newProductForm.key_notes.split(',').map(n => n.trim()),
      description: newProductForm.description,
      scent_mixes: newProductForm.scent_mixes,
      sillage: parseInt(newProductForm.sillage),
      longevity: parseInt(newProductForm.longevity),
      gender: parseInt(newProductForm.gender),
      batch_details: newProductForm.batch_details,
      scarcity_note: newProductForm.scarcity_note,
      images: validImages.length > 0 ? validImages : ['https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&q=80&w=600']
    };
    
    database.insertProduct(newProd).then(savedProduct => {
      setProducts([...products, savedProduct]);
      
      // Save new category for future if custom category was entered
      if (newProductForm.isCustomCategory && resolvedCategory) {
        const upperCat = resolvedCategory.trim().toUpperCase();
        if (upperCat && !categories.includes(upperCat)) {
          const updatedCategories = [...categories, upperCat];
          setCategories(updatedCategories);
          localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(updatedCategories));
        }
      }

      setNewProductForm({
        name: '',
        category: 'OUD BLENDS',
        customCategory: '',
        isCustomCategory: false,
        price: '',
        stock_status: 'in_stock',
        scent_family: '',
        key_notes: '',
        description: '',
        scent_mixes: '',
        sillage: '80',
        longevity: '85',
        gender: '50',
        batch_details: 'Batch #026 — Handcrafted',
        scarcity_note: 'Limited Release — Unique Edition',
        images: []
      });
      alert(`Published Successfully! New link generated at: elixyr.ae/${savedProduct.slug}`);
    });
  };

  const handleDeleteProduct = (id) => {
    if (confirm("Are you sure you want to permanently delete this product?")) {
      database.deleteProduct(id).then(() => {
        setProducts(products.filter(p => p.id !== id));
      });
    }
  };

  const handleUpdateProductStock = (id, newStatus) => {
    database.updateProduct(id, { stock_status: newStatus }).then(updatedProduct => {
      setProducts(products.map(p => p.id === id ? updatedProduct : p));
    });
  };

  const handleUpdateProductPrice = (id, newPrice) => {
    if (!newPrice || isNaN(newPrice)) return;
    database.updateProduct(id, { price: parseFloat(newPrice) }).then(updatedProduct => {
      setProducts(products.map(p => p.id === id ? updatedProduct : p));
    });
  };

  const handleSaveProductEdits = (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    const resolvedCategory = editingProduct.isCustomCategory && editingProduct.customCategory && editingProduct.customCategory.trim()
      ? editingProduct.customCategory.trim().toUpperCase()
      : editingProduct.category;

    const updatedSlug = editingProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const updatedProduct = {
      ...editingProduct,
      category: resolvedCategory,
      slug: updatedSlug
    };

    // Strip temp UI properties before database save
    delete updatedProduct.isCustomCategory;
    delete updatedProduct.customCategory;

    database.updateProduct(editingProduct.id, updatedProduct).then(savedProduct => {
      setProducts(products.map(p => p.id === editingProduct.id ? savedProduct : p));
      
      // Save new category for future if custom category was entered
      if (editingProduct.isCustomCategory && resolvedCategory) {
        const upperCat = resolvedCategory.trim().toUpperCase();
        if (upperCat && !categories.includes(upperCat)) {
          const updatedCategories = [...categories, upperCat];
          setCategories(updatedCategories);
          localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(updatedCategories));
        }
      }

      setEditingProduct(null);
      alert("Product details updated successfully!");
    });
  };

  // --- Admin Blog CRUD handlers ---
  const handleCreateBlog = (e) => {
    e.preventDefault();
    const resolvedCategory = newBlogForm.isCustomCategory && newBlogForm.customCategory.trim()
      ? newBlogForm.customCategory.trim().toUpperCase()
      : newBlogForm.category;
    const newBlog = {
      id: `blog-${Date.now()}`,
      title: newBlogForm.title,
      slug: newBlogForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: resolvedCategory,
      excerpt: newBlogForm.excerpt,
      content: newBlogForm.content,
      image_url: newBlogForm.image_url.trim() || 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&q=80&w=600',
      extra_images: newBlogForm.extra_images.filter(u => u.trim() !== '')
    };

    database.insertBlog(newBlog).then(savedBlog => {
      setBlogs([savedBlog, ...blogs]);
      setNewBlogForm({
        title: '',
        category: 'BUYING GUIDE',
        customCategory: '',
        isCustomCategory: false,
        excerpt: '',
        content: '',
        image_url: '',
        extra_images: []
      });
      alert("New lifestyle guide published to Journal successfully!");
    });
  };

  const handleSaveBlogEdits = (e) => {
    e.preventDefault();
    if (!editingBlog) return;
    const updatedSlug = editingBlog.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const updatedBlog = { ...editingBlog, slug: updatedSlug };
    database.updateBlog ? database.updateBlog(editingBlog.id, updatedBlog).then(saved => {
      setBlogs(blogs.map(b => b.id === editingBlog.id ? saved : b));
      setEditingBlog(null);
      alert('Article updated successfully!');
    }) : (() => {
      setBlogs(blogs.map(b => b.id === editingBlog.id ? updatedBlog : b));
      setEditingBlog(null);
      alert('Article updated successfully!');
    })();
  };

  const handleDeleteBlog = (id) => {
    if (confirm("Are you sure you want to delete this article?")) {
      database.deleteBlog(id).then(() => {
        setBlogs(blogs.filter(b => b.id !== id));
      });
    }
  };

  // --- Admin Order CRUD & Action handlers ---
  const handleBookCourier = async (order) => {
    try {
      const res = await integrationServices.bookDelivery(order);
      if (res.success) {
        const updated = await database.updateOrder(order.id, {
          status: 'out_of_delivery',
          tracking_number: res.trackingNumber,
          tracking_link: res.trackingLink
        });
        setOrders(orders.map(o => o.id === order.id ? updated : o));
        alert(`Logistics Booked Successfully!\nAWB Acknowledged: ${res.trackingNumber}\nStatus updated to Out for Delivery.`);
      }
    } catch (err) {
      console.error("Failed to book courier delivery shipment:", err);
      alert("Error booking courier delivery shipment.");
    }
  };

  const handleUpdateOrderStatus = async (id, newStatus) => {
    try {
      const updated = await database.updateOrder(id, { status: newStatus });
      setOrders(orders.map(o => o.id === id ? updated : o));
    } catch (err) {
      console.error("Failed to update order status:", err);
    }
  };

  const handleSaveOrderEdits = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      let shippingFee = 15;
      const em = editingOrder.emirate || 'Dubai (15 AED)';
      if (em.includes('Abu Dhabi') || em.includes('Ajman')) shippingFee = 20;
      else if (em.includes('Ras Al Khaimah') || em.includes('Fujairah')) shippingFee = 25;
      
      const subtotal = editingOrder.subtotal || 0;
      const grandTotal = subtotal + shippingFee;

      const orderPayload = {
        ...editingOrder,
        delivery_fee: shippingFee,
        total_amount: grandTotal
      };

      const updated = await database.updateOrder(editingOrder.id, orderPayload);
      
      // Update in local state with both camelCase and snake_case properties
      const normalized = {
        ...updated,
        orderNumber: updated.order_number || updated.orderNumber,
        clientName: updated.client_name || updated.clientName,
        total: updated.total_amount || updated.total
      };

      setOrders(orders.map(o => o.id === editingOrder.id ? normalized : o));
      setEditingOrder(null);
      alert("Order details updated successfully!");
    } catch (err) {
      console.error("Failed to save order edits:", err);
      alert("Error saving order updates.");
    }
  };

  const handleDeleteOrder = async (id) => {
    if (confirm("Are you sure you want to permanently delete this order record?")) {
      try {
        await database.deleteOrder(id);
        setOrders(orders.filter(o => o.id !== id));
      } catch (err) {
        console.error("Failed to delete order record:", err);
      }
    }
  };

  const handleSendWhatsAppConcierge = async (order) => {
    try {
      const res = await integrationServices.sendWhatsAppReceipt(order, order.tracking_link, order.tracking_number);
      if (res.success) {
        alert("WhatsApp Concierge deep-link simulated. Review local terminal logs for Meta payload details.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendEmailReceipt = async (order) => {
    try {
      const res = await integrationServices.sendEmailReceipt(order, order.tracking_link, order.tracking_number);
      if (res.success) {
        alert("Email Dispatch simulated. Review console logs for elegant luxury HTML structure.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Catalog Filtration
  const filteredProducts = products.filter(p => {
    if (activeCategory === 'ALL FRAGRANCES') return true;
    return p.category === activeCategory;
  });

  const lowStockCount = products.filter(p => p.stock_status === 'low_stock').length;
  const outOfStockCount = products.filter(p => p.stock_status === 'out_of_stock').length;

  // --- Curated Scent Matching Logic ---
  const handleQuizAnswer = (key, value) => {
    setQuizAnswers(prev => ({ ...prev, [key]: value }));
    const nextStep = quizStep + 1;
    setQuizStep(nextStep);

    // If final question answered, trigger match scoring
    if (nextStep === 4) {
      calculateScentMatch({ ...quizAnswers, [key]: value });
    }
  };

  const calculateScentMatch = (answers) => {
    let topScore = -1;
    let match = null;

    products.forEach(p => {
      let score = 0;

      // 1. Silhouette matching (Gender indices)
      if (answers.silhouette === 'feminine') {
        if (p.gender < 45) score += 3;
        else if (p.gender <= 60) score += 1;
      } else if (answers.silhouette === 'masculine') {
        if (p.gender > 65) score += 3;
        else if (p.gender >= 50) score += 1;
      } else { // shared
        if (p.gender >= 40 && p.gender <= 65) score += 3;
      }

      // 2. Olfactory Niche matches
      if (answers.niche === 'deep') {
        if (p.category === 'OUD BLENDS') score += 4;
      } else if (answers.niche === 'powdery') {
        if (p.category === 'MUSK BLENDS') score += 4;
      } else { // vibrant
        if (p.category === 'SIGNATURE EXTRAITS') score += 4;
      }

      // 3. Intensity matches (Sillage)
      if (answers.intensity === 'quiet') {
        if (p.sillage < 55) score += 2;
      } else if (answers.intensity === 'sovereign') {
        if (p.sillage > 80) score += 2;
      } else { // refined
        if (p.sillage >= 55 && p.sillage <= 80) score += 2;
      }

      if (score > topScore) {
        topScore = score;
        match = p;
      }
    });

    // Handle fallback just in case
    setMatchedProduct(match || products[0]);
  };

  const resetQuiz = () => {
    setQuizStep(0);
    setQuizAnswers({ silhouette: '', niche: '', intensity: '' });
    setMatchedProduct(null);
  };

  return (
    <div className="app-container">
      
      {/* 1. BRAND GLOBAL HEADER */}
      <header className="site-header">
        <div className="container">
          {/* Brand Premium Logo Asset */}
          <div className="logo" onClick={() => navigateTo('/')} style={{cursor: 'pointer'}}>
            <img src={logoNoBg} alt="ELIXYR Logo" className="logo-image" />
          </div>
          
          <nav>
            <ul className="nav-links">
              {currentRoute !== '/' && (
                <li><button onClick={() => navigateTo('/')} className="nav-link">Home</button></li>
              )}
              <li>
                <button 
                  onClick={() => { navigateTo('/'); setTimeout(() => document.getElementById('shop')?.scrollIntoView({behavior:'smooth'}), 100); }} 
                  className="nav-link"
                >
                  Shop
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { navigateTo('/'); setTimeout(() => document.getElementById('discovery')?.scrollIntoView({behavior:'smooth'}), 100); }} 
                  className="nav-link"
                >
                  Gifting
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { navigateTo('/journal'); }} 
                  className="nav-link"
                >
                  Journal
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { setIsQuizOpen(true); resetQuiz(); }} 
                  className="nav-link"
                  style={{ color: 'var(--accent-gold)', fontWeight: '600' }}
                >
                  Scent Finder
                </button>
              </li>
              <li>
                <button 
                  onClick={() => navigateTo('/wanna-see-hows-your-order-doing')} 
                  className="nav-link"
                >
                  Track Order
                </button>
              </li>
            </ul>
          </nav>

          <div className="header-actions">
            <button className="cart-icon-btn" onClick={() => setIsCartOpen(true)}>
              CART <span className="cart-badge">{cart.reduce((sum, i) => sum + i.qty, 0)}</span>
            </button>

            <div className="theme-toggle-container">
              <div className="theme-toggle-switch" onClick={toggleTheme} title={isDarkMode ? "Switch to Light Curation" : "Switch to Sovereign Dark"}>
                <div style={{zIndex: 1, display: 'flex', alignItems: 'center', opacity: isDarkMode ? 0.3 : 1}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                </div>
                <div style={{zIndex: 1, display: 'flex', alignItems: 'center', opacity: isDarkMode ? 1 : 0.3}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </div>
                <div className="theme-toggle-thumb"></div>
              </div>
            </div>

            {/* Mobile Hamburger Toggle Button */}
            <button className="mobile-menu-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle Menu" style={{marginLeft: '12px'}}>
              <div className={`hamburger-bar ${isMobileMenuOpen ? 'open' : ''}`}></div>
              <div className={`hamburger-bar ${isMobileMenuOpen ? 'open' : ''}`}></div>
              <div className={`hamburger-bar ${isMobileMenuOpen ? 'open' : ''}`}></div>
            </button>
          </div>
        </div>
      </header>

      {/* Sliding Mobile Navigation Menu Overlay (Moved outside header to prevent backdrop-filter containing block constraint) */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-drawer" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setIsMobileMenuOpen(false)} style={{top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer'}}>×</button>
            <ul className="mobile-nav-links" style={{marginTop: '40px'}}>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); navigateTo('/'); }} className="mobile-nav-link">Home</button>
              </li>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); navigateTo('/'); setTimeout(() => document.getElementById('shop')?.scrollIntoView({behavior:'smooth'}), 100); }} className="mobile-nav-link">Shop</button>
              </li>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); navigateTo('/'); setTimeout(() => document.getElementById('discovery')?.scrollIntoView({behavior:'smooth'}), 100); }} className="mobile-nav-link">Gifting</button>
              </li>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); navigateTo('/journal'); }} className="mobile-nav-link">Journal</button>
              </li>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); setIsQuizOpen(true); resetQuiz(); }} className="mobile-nav-link" style={{color: 'var(--accent-gold)'}}>Scent Finder</button>
              </li>
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); navigateTo('/wanna-see-hows-your-order-doing'); }} className="mobile-nav-link">Track Order</button>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* --- DYNAMIC ROUTER SWEEP --- */}

      {/* ROUTE 1: HOME PAGE ROUTE ('/') */}
      {currentRoute === '/' && (
        <main>
          {/* Hero Frame */}
          <section id="hero" className="hero-section">
            <div className="container hero-grid">
              <div className="hero-content">
                <h1>Leave a trail they'll never forget.</h1>
                <p className="hero-description">
                  A majestic aura of red saffron and smoked agarwood, lingering like a warm memory long after you're gone—an unforgettable essence of you.
                </p>
                
                {/* Virtual Scent Sommelier Banner Trigger */}
                <div style={{
                  backgroundColor: 'var(--accent-gold-light)', 
                  border: '1px solid var(--accent-gold)', 
                  padding: '12px 18px',
                  borderRadius: '2px',
                  marginBottom: '24px',
                  maxWidth: '520px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{textAlign: 'left'}}>
                    <span style={{fontSize: '0.6rem', fontWeight: '700', color: 'var(--accent-gold)', letterSpacing: '1px', textTransform: 'uppercase'}}>CAN'T FIND YOUR DESIRED PERFUME?</span>
                    <h4 className="font-serif" style={{fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '2px'}}>Consult Our Virtual Scent Sommelier</h4>
                  </div>
                  <button onClick={() => { setIsQuizOpen(true); resetQuiz(); }} className="btn btn-primary" style={{padding: '8px 16px', fontSize: '0.65rem'}}>
                    Take Quiz
                  </button>
                </div>

                <div className="hero-actions">
                  <a href="#shop" onClick={(e) => { e.preventDefault(); document.getElementById('shop').scrollIntoView({behavior: 'smooth'}); }} className="btn btn-primary">Explore Shop</a>
                  <button onClick={() => navigateTo('/journal')} className="btn btn-secondary">Discover Scents</button>

                </div>
              </div>

              <div className="hero-visual">
                <div className="visual-container">
                  <div className="notes-badge">
                    <div className="badge-row">
                      <div className="badge-item">
                        <span className="badge-title">BEST SELLER</span>
                        <span className="badge-value">Oud Extrait</span>
                      </div>
                      <div className="badge-item">
                        <span className="badge-title">KEY NOTES</span>
                        <span className="badge-value">Saffron, Oud, Amber</span>
                      </div>
                    </div>
                  </div>

                  <svg className="arrow-overlay" viewBox="0 0 100 100" fill="none">
                    <path d="M10 10 C 50 20, 80 50, 90 90" stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="3 3"/>
                    <polygon points="90,90 83,84 88,77" fill="var(--accent-gold)" />
                  </svg>

                   <div className="bottle-img-wrapper" style={{boxShadow: 'var(--shadow-lg)'}}>
                    <img 
                      src={bespokeOudReserve} 
                      alt="Bespoke Oud Reserve Perfume Bottle" 
                      className="bottle-img" 
                      fetchpriority="high"
                      style={{borderRadius: '4px'}}
                    />
                  </div>

                  <div style={{marginTop: '20px', textAlign: 'center'}}>
                    <button 
                      onClick={() => navigateTo('/bespoke-oud-reserve')} 
                      className="btn btn-primary"
                      style={{padding: '12px 24px', fontSize: '0.7rem', width: '100%', border: '1px solid var(--accent-gold)', letterSpacing: '2px', fontWeight: '600'}}
                    >
                      GET BESPOKE OUD RESERVE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* USP Frame */}
          <section className="usp-section">
            <div className="container usp-grid">
              <div className="usp-card">
                <h3>UAE delivery</h3>
                <p>Prepared with meticulous care and clear shipping status updates.</p>
              </div>
              <div className="usp-card">
                <h3>Secure checkout</h3>
                <p>Pay instantly online or continue through the WhatsApp concierge.</p>
              </div>
              <div className="usp-card">
                <h3>Gift ready</h3>
                <p>Minimal packaging with a beautifully detailed boutique receipt.</p>
              </div>
            </div>
          </section>

          {/* Product Catalog Grid */}
          <section id="shop" className="catalog-section">
            <div className="container">
              <div className="section-intro">
                <span className="section-category">COLLECTION</span>
                <h2 className="section-title">Perfumes made to be remembered quietly.</h2>
                <p className="section-desc">Every bottle is hand-assembled in the UAE using premium raw ingredients, blended to maintain a lasting, elegant presence.</p>
              </div>

              <div className="catalog-tabs">
                {['ALL FRAGRANCES', ...categories].map(tab => (
                  <button 
                    key={tab} 
                    className={`tab-btn ${activeCategory === tab ? 'active' : ''}`}
                    onClick={() => setActiveCategory(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="product-grid">
                {filteredProducts.map(product => (
                  <article key={product.id} className="product-card">
                    <div className="product-img-wrapper" style={{cursor: 'pointer'}} onClick={() => navigateTo(`/${product.slug}`)}>
                      <img src={product.images[0]} alt={product.name} className="product-img" />
                      {product.scarcity_note && (
                        <span className="card-scarcity-tag">{product.scarcity_note}</span>
                      )}
                      {product.stock_status === 'out_of_stock' && (
                        <span className="card-scarcity-tag" style={{backgroundColor: '#e74c3c', color: '#fff'}}>OUT OF STOCK</span>
                      )}
                    </div>
                    
                    <div className="product-info">
                      <span className="product-scent-family">{product.scent_family}</span>
                      <h3 className="product-title" style={{cursor: 'pointer'}} onClick={() => navigateTo(`/${product.slug}`)}>
                        {product.name}
                      </h3>
                      <p className="product-notes">{product.key_notes.join(', ')}</p>
                      
                      {/* Scent sliders gauges */}
                      <div className="scent-gauges-container">
                        <div className="scent-gauge-row">
                          <span className="gauge-label">Sillage</span>
                          <div className="gauge-bar-bg">
                            <div className="gauge-bar-fill" style={{width: `${product.sillage || 70}%`}}></div>
                          </div>
                          <span className="gauge-value-desc">
                            {product.sillage > 80 ? 'Powerful' : product.sillage > 50 ? 'Strong' : 'Intimate'}
                          </span>
                        </div>

                        <div className="scent-gauge-row">
                          <span className="gauge-label">Longevity</span>
                          <div className="gauge-bar-bg">
                            <div className="gauge-bar-fill" style={{width: `${product.longevity || 75}%`}}></div>
                          </div>
                          <span className="gauge-value-desc">
                            {product.longevity > 85 ? 'Infinite' : product.longevity > 60 ? 'Long' : 'Moderate'}
                          </span>
                        </div>
                      </div>

                      <div className="product-footer">
                        <span className="product-price">{product.price} AED</span>
                        <div className="product-actions-btn-group">
                          <button 
                            className="btn btn-secondary btn-card-action"
                            onClick={() => navigateTo(`/${product.slug}`)}
                          >
                            DISCOVER
                          </button>
                          <button 
                            className="btn btn-primary btn-card-action"
                            disabled={product.stock_status === 'out_of_stock'}
                            onClick={() => addToCart(product)}
                            style={{
                              backgroundColor: recentlyAddedId === product.id ? 'var(--accent-gold-light)' : '',
                              color: recentlyAddedId === product.id ? 'var(--accent-gold)' : '',
                              borderColor: recentlyAddedId === product.id ? 'var(--accent-gold)' : ''
                            }}
                          >
                            {product.stock_status === 'out_of_stock' 
                              ? 'OUT' 
                              : recentlyAddedId === product.id 
                                ? 'ADDED!' 
                                : 'ADD'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Discovery set banner */}
          <section id="discovery" className="container">
            <div className="discovery-section">
              <div className="container discovery-grid">
                <div>
                  <span className="section-category" style={{color: 'var(--accent-gold)'}}>DISCOVERY SET</span>
                  <h2 className="font-serif" style={{fontSize: '2.5rem', marginBottom: '12px'}}>Elixyr Discovery Set</h2>
                  <p style={{fontSize: '0.85rem', color: '#B2AAA0', marginBottom: '24px', lineHeight: '1.6'}}>
                    Test the complete Elixyr portfolio. A luxurious gold-embossed presentation box holding 2ml spray vials of our Oud, Musk, Amber, Dubai Meydan, and Signature blends.
                  </p>
                  
                  <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
                    <span className="font-serif" style={{fontSize: '2rem', fontWeight: 'bold'}}>{mockDiscoverySet.price} AED</span>
                    <button 
                      className="btn btn-primary" 
                      style={{
                        backgroundColor: recentlyAddedId === mockDiscoverySet.id ? 'var(--accent-gold-light)' : '#FAF9F5',
                        color: recentlyAddedId === mockDiscoverySet.id ? 'var(--accent-gold)' : '#0E0E0D',
                        border: recentlyAddedId === mockDiscoverySet.id ? '1px solid var(--accent-gold)' : 'none'
                      }}
                      onClick={() => addToCart(mockDiscoverySet)}
                    >
                      {recentlyAddedId === mockDiscoverySet.id ? 'ADDED TO CART!' : 'ADD TO CART'}
                    </button>
                  </div>
                </div>

                <div className="discovery-vials-grid">
                  {mockDiscoverySet.vials.map(v => (
                    <div key={v.name} className="vial-card">
                      <div className="vial-name">{v.name}</div>
                      <div className="vial-desc">{v.notes}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Secure Checkout Split Form */}
          <section id="secure-checkout" className="checkout-section">
            <div className="container">
              <div className="checkout-grid">
                
                {/* Form parameters */}
                <div className="checkout-form-card">
                  <span className="section-category">SECURE HANDOFF</span>
                  <h2 className="form-title font-serif">Complete your order in under a minute.</h2>
                  
                  <form onSubmit={handlePlaceOrder}>
                    <div className="form-group">
                      <label className="form-label">FULL NAME</label>
                      <input 
                        type="text" 
                        name="fullName" 
                        className="form-input" 
                        placeholder="Full name" 
                        required 
                        value={checkoutForm.fullName}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div className="form-group-row">
                      <div className="form-group">
                        <label className="form-label">EMAIL ADDRESS</label>
                        <input 
                          type="email" 
                          name="email" 
                          className="form-input" 
                          placeholder="email@example.com" 
                          value={checkoutForm.email}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">PHONE NUMBER</label>
                        <input 
                          type="tel" 
                          name="phone" 
                          className="form-input" 
                          placeholder="+971 5X XXX XXXX" 
                          required 
                          value={checkoutForm.phone}
                          onChange={handleInputChange}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">DELIVERY EMIRATE</label>
                      <select 
                        name="emirate" 
                        className="form-input"
                        value={checkoutForm.emirate}
                        onChange={handleInputChange}
                      >
                        <option>Dubai (15 AED)</option>
                        <option>Abu Dhabi (20 AED)</option>
                        <option>Sharjah (15 AED)</option>
                        <option>Ajman (20 AED)</option>
                        <option>Ras Al Khaimah (25 AED)</option>
                        <option>Fujairah (25 AED)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">PAYMENT METHOD</label>
                      <select 
                        name="paymentMethod" 
                        className="form-input"
                        value={checkoutForm.paymentMethod}
                        onChange={handleInputChange}
                      >
                        <option value="WhatsApp Order Concierge">WhatsApp Order Concierge (Active)</option>
                        <option value="Digital Payment" disabled>Digital Payment (Coming Soon)</option>
                        <option value="Cash on Delivery" disabled>Cash on Delivery (Coming Soon)</option>
                      </select>
                    </div>

                    {checkoutError && (
                      <div className="checkout-error-banner" role="alert" style={{
                        color: '#c0392b',
                        fontSize: '0.8rem',
                        marginBottom: '16px',
                        padding: '12px 16px',
                        border: '1px solid rgba(192, 57, 43, 0.2)',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '2px',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '500',
                        letterSpacing: '0.02em',
                        lineHeight: '1.4'
                      }}>
                        <span style={{ fontSize: '1rem', color: '#c0392b' }}>⚠️</span>
                        <span>{checkoutError}</span>
                      </div>
                    )}

                    <button type="submit" className="btn-submit">
                      {checkoutForm.paymentMethod === 'WhatsApp Order Concierge' ? 'REDIRECT TO WHATSAPP' : 'PLACE SECURED ORDER'}
                    </button>
                  </form>
                </div>

                {/* Skeuomorphic Live Slip Preview on the Right (NO Print Action, NO Barcode, NO status badges) */}
                <div className="receipt-wrapper">
                  <div className="boutique-receipt">

                    <div className="receipt-header">
                      <div className="receipt-logo">ELIXYR</div>
                      <div className="receipt-type">BOUTIQUE ORDER SLIP</div>
                      <div className="receipt-order-no">{orderNumber}</div>
                    </div>

                    <div className="receipt-meta-grid">
                      <div className="receipt-meta-item">
                        <span className="receipt-meta-label">DATE:</span>
                        <span className="receipt-meta-val">{new Date().toISOString().split('T')[0]}</span>
                      </div>
                      <div className="receipt-meta-item">
                        <span className="receipt-meta-label">EMIRATE:</span>
                        <span className="receipt-meta-val">{checkoutForm.emirate.split(' ')[0]}</span>
                      </div>
                      <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                        <span className="receipt-meta-label">CLIENT:</span>
                        <span className="receipt-meta-val" style={{maxWidth: '250px'}}>{checkoutForm.fullName || 'Pending Details'}</span>
                      </div>
                      <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                        <span className="receipt-meta-label">PHONE:</span>
                        <span className="receipt-meta-val" style={{maxWidth: '250px'}}>{checkoutForm.phone || 'Pending Details'}</span>
                      </div>
                    </div>

                    <div className="receipt-items-list">
                      {cart.length === 0 ? (
                        <div className="receipt-empty-row">— No items selected —</div>
                      ) : (
                        cart.map(item => (
                          <div key={item.id} className="receipt-item-row">
                            <span>{item.name}</span>
                            <span className="receipt-item-qty">x{item.qty}</span>
                            <span className="receipt-item-total">{item.price * item.qty} AED</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="receipt-total-section">
                      <div className="receipt-total-row">
                        <span>SUBTOTAL:</span>
                        <span>{getSubtotal()} AED</span>
                      </div>
                      <div className="receipt-total-row">
                        <span>SHIPPING:</span>
                        <span>{cart.length > 0 ? getDeliveryFee() : 0} AED</span>
                      </div>
                      <div className="receipt-total-row grand-total">
                        <span>TOTAL DUE:</span>
                        <span>{getTotalDue()} AED</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </section>
        </main>
      )}

      {/* ROUTE 2: FULL-SCREEN PRODUCT DETAIL ROUTE ('/product-detail') */}
      {currentRoute === '/product-detail' && activeProduct && (
        <main className="container" style={{paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)'}}>
          <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center'}}>
            <span onClick={() => navigateTo('/')} style={{cursor: 'pointer', transition: 'color 0.2s'}} onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'} onMouseLeave={e => e.target.style.color = ''}>Home</span>
            <span>/</span>
            <span>Collection</span>
            <span>/</span>
            <span style={{color: 'var(--text-primary)'}}>{activeProduct.name}</span>
          </div>
          <button onClick={() => navigateTo('/')} className="btn btn-secondary" style={{marginBottom: 'var(--space-lg)'}}>
            ← Return to Collection
          </button>
          
          <div className="hero-grid" style={{alignItems: 'start'}}>
            {/* Visual Column */}
            <div className="hero-visual">
              <div className="visual-container" style={{maxWidth: '100%'}}>
                <div className="bottle-img-wrapper" style={{aspectRatio: '4/5', borderRadius: '4px'}}>
                  <img src={activeProduct.images[activeImageIdx || 0] || activeProduct.images[0]} alt={activeProduct.name} className="bottle-img" />
                </div>
                {activeProduct.images && activeProduct.images.length > 1 && (
                  <div style={{display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'center', flexWrap: 'wrap'}}>
                    {activeProduct.images.map((img, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setActiveImageIdx(idx)}
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '2px',
                          overflow: 'hidden',
                          border: '1px solid ' + ((activeImageIdx || 0) === idx ? 'var(--accent-gold)' : 'var(--border-primary)'),
                          cursor: 'pointer',
                          opacity: (activeImageIdx || 0) === idx ? 1 : 0.6,
                          transition: 'all 0.2s'
                        }}
                      >
                        <img src={img} alt={`Thumb ${idx + 1}`} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                      </div>
                    ))}
                  </div>
                )}
                {activeProduct.scarcity_note && (
                  <div className="reserve-link-container">
                    <span className="scarcity-pill" style={{
                      backgroundColor: 'var(--accent-gold-light)', 
                      color: 'var(--accent-gold)', 
                      padding: '8px 16px', 
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      display: 'inline-block',
                      borderRadius: '2px'
                    }}>
                      {activeProduct.scarcity_note}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Scent story descriptions */}
            <div className="hero-content" style={{textAlign: 'left'}}>
              <span className="section-category">{activeProduct.scent_family}</span>
              <h1 style={{fontSize: '3.5rem', marginBottom: '8px', fontWeight: '300'}}>{activeProduct.name}</h1>
              <p style={{fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--accent-gold)', marginBottom: '16px'}}>
                {activeProduct.key_notes.join(' • ')}
              </p>
              
              <p className="hero-description" style={{maxWidth: '100%', fontSize: '1rem', color: 'var(--text-secondary)'}}>
                {activeProduct.description}
              </p>

              {/* Composition lists */}
              <div className="formula-grid" style={{margin: '24px 0'}}>
                <div className="formula-item">
                  <span className="formula-label">Bespoke Batching</span>
                  <span className="formula-value">{activeProduct.batch_details || 'Hand-blended in Dubai'}</span>
                </div>
                <div className="formula-item">
                  <span className="formula-label">Blending Oil Formulas</span>
                  <span className="formula-value" style={{maxWidth: '300px', textAlign: 'right'}}>{activeProduct.scent_mixes}</span>
                </div>
              </div>

              {/* Scent sliders */}
              <div className="scent-gauges-container" style={{borderBottom: '1px solid var(--border-primary)', paddingBottom: '24px', marginBottom: '24px'}}>
                <h4 className="font-serif" style={{fontSize: '1.2rem', marginBottom: '12px'}}>Scent Characteristics & Aura</h4>
                
                <div className="scent-gauge-row">
                  <span className="gauge-label">Presence & Trail Intensity</span>
                  <div className="gauge-bar-bg">
                    <div className="gauge-bar-fill" style={{width: `${activeProduct.sillage || 70}%`}}></div>
                  </div>
                  <span className="gauge-value-desc">{activeProduct.sillage}% (Noticeable & Captivating)</span>
                </div>

                <div className="scent-gauge-row">
                  <span className="gauge-label">Lingering Duration on Skin</span>
                  <div className="gauge-bar-bg">
                    <div className="gauge-bar-fill" style={{width: `${activeProduct.longevity || 75}%`}}></div>
                  </div>
                  <span className="gauge-value-desc">{activeProduct.longevity}% (Day-to-Night Endurance)</span>
                </div>

                <div className="scent-gauge-row">
                  <span className="gauge-label">Best Suited For</span>
                  <div className="gauge-bar-bg">
                    <div className="gauge-bar-fill" style={{width: `${activeProduct.gender || 50}%`}}></div>
                  </div>
                  <span className="gauge-value-desc">
                    {activeProduct.gender > 70 ? 'Sovereign Masculine Profile' : activeProduct.gender < 40 ? 'Sensual Feminine Profile' : 'Shared Harmony (Unisex)'}
                  </span>
                </div>
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: '32px'}}>
                <span className="font-serif" style={{fontSize: '2.2rem', fontWeight: 'bold'}}>{activeProduct.price} AED</span>
                <button 
                  className="btn btn-primary"
                  disabled={activeProduct.stock_status === 'out_of_stock'}
                  onClick={() => addToCart(activeProduct)}
                  style={{
                    backgroundColor: recentlyAddedId === activeProduct.id ? 'var(--accent-gold-light)' : '',
                    color: recentlyAddedId === activeProduct.id ? 'var(--accent-gold)' : '',
                    borderColor: recentlyAddedId === activeProduct.id ? 'var(--accent-gold)' : ''
                  }}
                >
                  {activeProduct.stock_status === 'out_of_stock' 
                    ? 'OUT OF STOCK' 
                    : recentlyAddedId === activeProduct.id 
                      ? 'ADDED TO CART!' 
                      : 'ADD TO CART'}
                </button>
              </div>

            </div>
          </div>

          {/* 3. RELATED FRAGRANCES SECTION */}
          {(() => {
            const related = products
              .filter(p => p.id !== activeProduct.id && (p.category === activeProduct.category || p.scent_family === activeProduct.scent_family))
              .slice(0, 3);
            const displayRelated = related.length >= 3 ? related : [...related, ...products.filter(p => p.id !== activeProduct.id && !related.find(r => r.id === p.id))].slice(0, 3);

            return (
              <div style={{marginTop: 'var(--space-2xl)', borderTop: '1px solid var(--border-primary)', paddingTop: 'var(--space-xl)'}}>
                <div style={{textAlign: 'center', marginBottom: 'var(--space-lg)'}}>
                  <span className="section-category" style={{color: 'var(--accent-gold)', letterSpacing: '1.5px', fontSize: '0.65rem'}}>COMPLETING YOUR OLFACTORY WARDROBE</span>
                  <h3 className="font-serif" style={{fontSize: '2rem', marginTop: '6px', marginBottom: '12px'}}>You May Also Like</h3>
                </div>
                
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px'}}>
                  {displayRelated.map(p => (
                    <div key={p.id} className="blog-card" style={{padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer', border: '1px solid var(--border-primary)', borderRadius: '2px', backgroundColor: 'var(--bg-card)'}} onClick={() => { setScopedProductSlug(p.slug); window.scrollTo({top:0, behavior:'smooth'}); }}>
                      <div className="bottle-img-wrapper" style={{aspectRatio: '1', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px'}}>
                        <img src={p.images[0]} alt={p.name} className="bottle-img" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                      </div>
                      <span style={{fontSize: '0.65rem', color: 'var(--accent-gold)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '700'}}>{p.scent_family}</span>
                      <h4 className="font-serif" style={{fontSize: '1.25rem', marginTop: '4px', marginBottom: '8px', color: 'var(--text-primary)'}}>{p.name}</h4>
                      <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', flexGrow: 1, marginBottom: '16px', lineHeight: '1.5'}}>
                        {p.description.substring(0, 90)}...
                      </p>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-primary)', paddingTop: '12px'}}>
                        <span style={{fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)'}}>{p.price} AED</span>
                        <button 
                          className="btn btn-primary"
                          onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                          style={{
                            padding: '6px 12px', 
                            fontSize: '0.6rem', 
                            minHeight: 'auto',
                            backgroundColor: recentlyAddedId === p.id ? 'var(--accent-gold-light)' : '',
                            color: recentlyAddedId === p.id ? 'var(--accent-gold)' : '',
                            borderColor: recentlyAddedId === p.id ? 'var(--accent-gold)' : ''
                          }}
                        >
                          {recentlyAddedId === p.id ? 'ADDED!' : 'ADD TO CART'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </main>
      )}



      {/* ROUTE: DEDICATED JOURNAL INDEX PAGE ('/journal') */}
      {currentRoute === '/journal' && (
        <main className="container animate-fade-in" style={{paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)'}}>
          <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center'}}>
            <span onClick={() => navigateTo('/')} style={{cursor: 'pointer', transition: 'color 0.2s'}} onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'} onMouseLeave={e => e.target.style.color = ''}>Home</span>
            <span>/</span>
            <span style={{color: 'var(--text-primary)'}}>Journal</span>
          </div>

          <div className="section-intro" style={{textAlign: 'center', marginBottom: 'var(--space-2xl)'}}>
            <span className="section-category">ELIXYR JOURNAL</span>
            <h1 className="font-serif" style={{fontSize: '3.5rem', fontWeight: '300', marginTop: '8px'}}>Notes on scent, ritual, and gifting.</h1>
            <p style={{maxWidth: '600px', margin: '16px auto 0', color: 'var(--text-secondary)', fontSize: '0.95rem'}}>
              Discover our curation of olfactory guides, historic blending rituals, and sovereign gifting notes handcrafted by the house blenders.
            </p>
          </div>

          {/* Search & Category Filter Bar */}
          <div style={{
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '16px', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 'var(--space-xl)',
            borderBottom: '1px solid var(--border-primary)',
            paddingBottom: '24px'
          }}>
            {/* Category tabs */}
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
              {['ALL ARTICLES', ...Array.from(new Set(blogs.map(b => b.category.toUpperCase())))].map(cat => {
                const isActive = (cat === 'ALL ARTICLES' && activeCategory === 'ALL ARTICLES') || 
                                 (cat !== 'ALL ARTICLES' && activeCategory === cat);
                return (
                  <button 
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className="sidebar-btn"
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      letterSpacing: '1px',
                      borderRadius: '2px',
                      width: 'auto',
                      border: '1px solid ' + (isActive ? 'var(--accent-gold)' : 'var(--border-primary)'),
                      backgroundColor: isActive ? 'var(--accent-gold-light)' : 'transparent',
                      color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Keyword search */}
            <input 
              type="text" 
              placeholder="Search articles..." 
              className="form-input"
              style={{maxWidth: '300px', padding: '10px 16px'}}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value.toLowerCase())}
            />
          </div>

          {/* Journal Grid */}
          <div className="blog-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-xl)'}}>
            {blogs
              .filter(blog => {
                const matchesCat = activeCategory === 'ALL ARTICLES' || activeCategory === 'ALL FRAGRANCES' || blog.category.toUpperCase() === activeCategory;
                const matchesKw = !searchKeyword || 
                                  blog.title.toLowerCase().includes(searchKeyword) || 
                                  blog.excerpt.toLowerCase().includes(searchKeyword) || 
                                  blog.content.toLowerCase().includes(searchKeyword);
                return matchesCat && matchesKw;
              })
              .map(blog => (
                <article 
                  key={blog.id} 
                  className="blog-card" 
                  onClick={() => navigateTo(`/journal/${blog.slug}`)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '24px',
                    border: '1px solid var(--border-primary)',
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '2px',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div>
                    <span className="blog-meta" style={{fontSize: '0.65rem', fontWeight: '700', color: 'var(--accent-gold)', letterSpacing: '1px', textTransform: 'uppercase'}}>{blog.category}</span>
                    <h3 className="font-serif" style={{fontSize: '1.5rem', marginTop: '8px', marginBottom: '12px', fontWeight: '300', lineHeight: '1.3'}}>{blog.title}</h3>
                    <p className="blog-excerpt" style={{fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '20px'}}>{blog.excerpt}</p>
                  </div>
                  <span className="blog-link" style={{fontSize: '0.7rem', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-primary)'}}>READ ARTICLE →</span>
                </article>
              ))
            }
          </div>
        </main>
      )}

      {/* ROUTE: STAND-ALONE ARTICLE DETAIL VIEW ROUTE ('/journal-detail') */}
      {currentRoute === '/journal-detail' && (
        <main className="container animate-fade-in" style={{paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)'}}>
          {(() => {
            const activeBlog = blogs.find(b => b.slug === scopedBlogSlug);
            if (!activeBlog) {
              return (
                <div style={{textAlign: 'center', padding: '100px 0'}}>
                  <h2 className="font-serif">Article Not Found</h2>
                  <button onClick={() => navigateTo('/journal')} className="btn btn-primary" style={{marginTop: '24px'}}>Return to Journal</button>
                </div>
              );
            }
            return (
              <div style={{maxWidth: '800px', margin: '0 auto'}}>
                {/* Breadcrumbs */}
                <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center'}}>
                  <span onClick={() => navigateTo('/')} style={{cursor: 'pointer'}} onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'} onMouseLeave={e => e.target.style.color = ''}>Home</span>
                  <span>/</span>
                  <span onClick={() => navigateTo('/journal')} style={{cursor: 'pointer'}} onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'} onMouseLeave={e => e.target.style.color = ''}>Journal</span>
                  <span>/</span>
                  <span style={{color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '280px'}}>{activeBlog.title}</span>
                </div>

                <button onClick={() => navigateTo('/journal')} className="btn btn-secondary" style={{marginBottom: 'var(--space-xl)'}}>
                  ← Back to Journal
                </button>

                <article>
                  <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700', fontSize: '0.75rem', letterSpacing: '1.5px'}}>{activeBlog.category}</span>
                  <h1 className="font-serif" style={{fontSize: '3.2rem', fontWeight: '300', marginTop: '12px', marginBottom: '24px', lineHeight: '1.2'}}>{activeBlog.title}</h1>
                  
                  {/* Premium Multi-Image Gallery */}
                  {(() => {
                    const blogImages = activeBlog.images || (activeBlog.image_url ? [activeBlog.image_url, ...(activeBlog.extra_images || [])] : []);
                    if (blogImages.length === 0) return null;
                    return (
                      <div className="blog-images-gallery" style={{marginBottom: '32px'}}>
                        <div className="main-blog-image-wrapper" style={{borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-primary)', marginBottom: '12px'}}>
                          <img 
                            src={blogImages[0]} 
                            alt={activeBlog.title} 
                            style={{width: '100%', maxHeight: '480px', objectFit: 'cover', display: 'block'}} 
                          />
                        </div>
                        {blogImages.length > 1 && (
                          <div style={{display: 'grid', gridTemplateColumns: `repeat(${blogImages.length - 1}, 1fr)`, gap: '12px'}}>
                            {blogImages.slice(1).map((img, i) => (
                              <div key={i} style={{borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-primary)'}}>
                                <img src={img} alt={`Gallery ${i}`} style={{width: '100%', height: '140px', objectFit: 'cover', display: 'block'}} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div 
                    style={{
                      fontSize: '1.1rem', 
                      color: 'var(--text-primary)', 
                      lineHeight: '1.85', 
                      fontFamily: 'var(--font-serif)', 
                      textAlign: 'justify',
                      whiteSpace: 'pre-line'
                    }}
                  >
                    {activeBlog.content}
                  </div>
                </article>
              </div>
            );
          })()}
        </main>
      )}

      {/* ROUTE: DEDICATED ORDER TRACKING PAGE ('/track-order') */}
      {currentRoute === '/track-order' && (
        <main className="container animate-fade-in" style={{paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)'}}>
          <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center'}}>
            <span onClick={() => navigateTo('/')} style={{cursor: 'pointer'}} onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'} onMouseLeave={e => e.target.style.color = ''}>Home</span>
            <span>/</span>
            <span style={{color: 'var(--text-primary)'}}>Track Order</span>
          </div>

          <div style={{maxWidth: '700px', margin: '0 auto'}}>
            {/* Search Lookup Box */}
            <div className="admin-lock-card" style={{maxWidth: '100%', margin: '0 0 var(--space-xl)', textAlign: 'center'}}>
              <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700', fontSize: '0.75rem', letterSpacing: '1.5px'}}>BOUTIQUE LOGISTICS</span>
              <h2 className="font-serif" style={{fontSize: '2.2rem', marginTop: '8px', marginBottom: '8px'}}>Wanna see how’s your order doing?</h2>
              <p style={{fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '24px'}}>
                Enter your unique Elixyr Order ID (e.g., ELX-01007) to see the live handcrafted preparation and dispatch updates.
              </p>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const needle = searchOrderId.toUpperCase().replace(/\s+/g, '');
                const matched = orders.find(o => {
                  const num = (o.order_number || o.orderNumber || '');
                  return num.toUpperCase().replace(/\s+/g, '') === needle;
                });
                if (matched) {
                  setTrackedOrder(matched);
                  setTrackingError(false);
                } else {
                  // Fallback: check in-memory finalizedOrder (uses camelCase orderNumber)
                  const foNum = finalizedOrder ? (finalizedOrder.orderNumber || finalizedOrder.order_number || '') : '';
                  if (finalizedOrder && foNum.toUpperCase().replace(/\s+/g, '') === needle) {
                    setTrackedOrder(finalizedOrder);
                    setTrackingError(false);
                  } else {
                    setTrackedOrder(null);
                    setTrackingError(true);
                  }
                }

              }} style={{display: 'flex', gap: '12px', justifyContent: 'center'}}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="ELX-0XXXX" 
                  required 
                  value={searchOrderId}
                  onChange={e => setSearchOrderId(e.target.value)}
                  style={{maxWidth: '300px', textAlign: 'center', letterSpacing: '1.5px', textTransform: 'uppercase', fontSize: '1rem', fontWeight: 'bold'}}
                />
                <button type="submit" className="btn btn-primary" style={{padding: '0 32px'}}>TRACK</button>
              </form>

              {trackingError && (
                <div style={{color: '#e74c3c', fontSize: '0.75rem', fontWeight: '600', marginTop: '12px'}}>
                  Oops! We couldn't find an order with ID "{searchOrderId}". Please check your order slip and try again.
                </div>
              )}
            </div>

            {/* If we have a tracked order, display it! */}
            {(() => {
              // Automatically display finalizedOrder if no order has been searched yet
              const activeTrackingOrder = trackedOrder || (finalizedOrder && !trackingError ? finalizedOrder : null);
              
              if (!activeTrackingOrder) return null;

              // Parse status
              const rawStatus = activeTrackingOrder.status || "Received";
              const status = rawStatus.toLowerCase();

              // Helper for custom premium minimalist vector illustration matching
              const renderPremiumGraphic = () => {
                let strokeColor = "var(--accent-gold)";
                if (status === 'delivered') strokeColor = "#2ecc71";
                if (status === 'cancelled' || status.includes('cancel') || status.includes('reject')) strokeColor = "#e74c3c";

                return (
                  <div style={{
                    width: '200px', 
                    height: '200px', 
                    margin: '0 auto', 
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {(() => {
                      if (status === 'received' || status === 'pending') {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={strokeColor} strokeWidth="1.5">
                            <style>{`
                              @keyframes pulseSeal {
                                0% { transform: scale(0.96); opacity: 0.85; }
                                50% { transform: scale(1.02); opacity: 1; }
                                100% { transform: scale(0.96); opacity: 0.85; }
                              }
                              .anim-seal {
                                animation: pulseSeal 3s ease-in-out infinite;
                                transform-origin: center;
                              }
                            `}</style>
                            <g className="anim-seal">
                              <path d="M50 8 L78 20 L92 48 L78 76 L50 88 L22 76 L8 48 L22 20 Z" strokeWidth="1" strokeDasharray="3 3"/>
                              <path d="M50 12 L75 23 L87 48 L75 73 L50 84 L25 73 L13 48 L25 23 Z" />
                              <circle cx="50" cy="50" r="24" strokeWidth="1" strokeDasharray="4 2"/>
                              <circle cx="50" cy="50" r="20" />
                              <path d="M46 40 H55 M46 40 V60 H56 M46 50 H53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </g>
                          </svg>
                        );
                      } else if (status === 'stock reserved' || status.includes('reserve')) {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={strokeColor} strokeWidth="1.5">
                            <style>{`
                              @keyframes waveFill {
                                0% { transform: translateY(0) rotate(0deg); }
                                50% { transform: translateY(-2px) rotate(2deg); }
                                100% { transform: translateY(0) rotate(0deg); }
                              }
                              @keyframes liquidGlow {
                                0% { opacity: 0.3; }
                                50% { opacity: 0.7; }
                                100% { opacity: 0.3; }
                              }
                              .anim-wave {
                                animation: waveFill 4s ease-in-out infinite;
                                transform-origin: center;
                              }
                              .liquid-glow {
                                animation: liquidGlow 2.5s ease-in-out infinite;
                              }
                            `}</style>
                            <rect x="42" y="10" width="16" height="8" rx="1" />
                            <line x1="45" y1="18" x2="55" y2="18" strokeWidth="2"/>
                            <rect x="46" y="18" width="8" height="6" />
                            <path d="M30 30 C30 26 34 24 50 24 C66 24 70 26 70 30 V82 C70 86 66 88 50 88 C34 88 30 86 30 82 Z" />
                            <path d="M34 32 C34 30 36 29 50 29 C64 29 66 30 66 32 V78 C66 82 64 84 50 84 C36 84 34 82 34 78 Z" strokeWidth="1" strokeDasharray="2 2"/>
                            <g className="anim-wave">
                              <path d="M35 55 C40 53 45 57 50 55 C55 53 60 57 65 55 V78 C65 81 63 83 50 83 C37 83 35 81 35 78 Z" fill="var(--accent-gold)" fillOpacity="0.15" stroke="none" />
                              <path d="M35 55 C40 53 45 57 50 55 C55 53 60 57 65 55" strokeWidth="1"/>
                            </g>
                            <path d="M50 40 L51 43 L54 44 L51 45 L50 48 L49 45 L46 44 L49 43 Z" fill="var(--accent-gold)" stroke="none" className="liquid-glow"/>
                            <path d="M42 65 L42.5 66.5 L44 67 L42.5 67.5 L42 69 L41.5 67.5 L40 67 L41.5 66.5 Z" fill="var(--accent-gold)" stroke="none" className="liquid-glow"/>
                          </svg>
                        );
                      } else if (status === 'ready for dispatch' || status.includes('ready')) {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={strokeColor} strokeWidth="1.5">
                            <style>{`
                              @keyframes drawRibbon {
                                0% { stroke-dashoffset: 200; }
                                100% { stroke-dashoffset: 0; }
                              }
                              @keyframes boxShimmer {
                                0% { opacity: 0.7; }
                                50% { opacity: 1; }
                                100% { opacity: 0.7; }
                              }
                              .anim-ribbon {
                                stroke-dasharray: 200;
                                animation: drawRibbon 3s ease-out forwards;
                              }
                              .anim-box {
                                animation: boxShimmer 3s ease-in-out infinite;
                              }
                            `}</style>
                            <g className="anim-box">
                              <rect x="25" y="38" width="50" height="42" rx="2" />
                              <rect x="22" y="30" width="56" height="8" rx="1" />
                            </g>
                            <line x1="50" y1="30" x2="50" y2="80" strokeWidth="2.5" />
                            <line x1="25" y1="59" x2="75" y2="59" strokeWidth="2.5" />
                            <path d="M50 30 C40 18 30 24 50 30 C60 18 70 24 50 30" strokeWidth="2.5" strokeLinecap="round" className="anim-ribbon" />
                            <rect x="54" y="44" width="12" height="18" rx="1" transform="rotate(15 54 44)"/>
                            <circle cx="58" cy="48" r="1" fill="var(--accent-gold)"/>
                            <line x1="50" y1="36" x2="57" y2="45" strokeWidth="1"/>
                          </svg>
                        );
                      } else if (status === 'out for delivery' || status.includes('out')) {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={strokeColor} strokeWidth="1.5">
                            <style>{`
                              @keyframes dashRoute {
                                to { stroke-dashoffset: -20; }
                              }
                              @keyframes pulseDot {
                                0% { r: 3; opacity: 0.5; }
                                50% { r: 6; opacity: 1; }
                                100% { r: 3; opacity: 0.5; }
                              }
                              .anim-route {
                                stroke-dasharray: 6, 4;
                                animation: dashRoute 4s linear infinite;
                              }
                              .anim-dot {
                                animation: pulseDot 2s ease-in-out infinite;
                              }
                            `}</style>
                            <circle cx="20" cy="70" r="3" fill="var(--accent-gold)" />
                            <circle cx="20" cy="70" r="7" strokeWidth="0.75" strokeDasharray="2 2" />
                            <text x="12" y="83" fill="var(--text-secondary)" fontSize="5" fontFamily="sans-serif">Atelier</text>
                            
                            <path d="M20 70 Q35 30 55 60 T80 30" className="anim-route" strokeWidth="2"/>
                            
                            <g transform="translate(80, 30)">
                              <circle cx="0" cy="0" r="3" fill="var(--accent-gold)" className="anim-dot"/>
                              <circle cx="0" cy="0" r="8" strokeWidth="0.75" />
                              <path d="M0 -3 C-2 -5 -2 -8 0 -10 C2 -8 2 -5 0 -3" fill="var(--accent-gold)" stroke="none"/>
                              <circle cx="0" cy="-6.5" r="0.75" fill="#fff" stroke="none"/>
                            </g>
                            <text x="70" y="18" fill="var(--text-secondary)" fontSize="5" fontFamily="sans-serif">Residence</text>
                            <circle cx="43" cy="49" r="4" fill="var(--accent-gold)"/>
                            <circle cx="43" cy="49" r="8" strokeWidth="0.5" strokeDasharray="1 3"/>
                          </svg>
                        );
                      } else if (status === 'delivered') {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={strokeColor} strokeWidth="1.5">
                            <style>{`
                              @keyframes emitMist {
                                0% { transform: translateY(0) scale(0.8); opacity: 0; }
                                50% { opacity: 0.8; }
                                100% { transform: translateY(-12px) scale(1.2); opacity: 0; }
                              }
                              .mist-particle-1 {
                                animation: emitMist 3s ease-out infinite;
                                transform-origin: 50px 10px;
                              }
                              .mist-particle-2 {
                                animation: emitMist 3s ease-out infinite;
                                animation-delay: 1.5s;
                                transform-origin: 50px 10px;
                              }
                            `}</style>
                            <circle cx="50" cy="6" r="1.5" fill="var(--accent-gold)" stroke="none" className="mist-particle-1" />
                            <circle cx="45" cy="4" r="1" fill="var(--accent-gold)" stroke="none" className="mist-particle-1" />
                            <circle cx="55" cy="4" r="1" fill="var(--accent-gold)" stroke="none" className="mist-particle-1" />
                            
                            <circle cx="50" cy="6" r="2" fill="var(--accent-gold)" stroke="none" className="mist-particle-2" />
                            <circle cx="42" cy="5" r="1" fill="var(--accent-gold)" stroke="none" className="mist-particle-2" />
                            <circle cx="58" cy="5" r="1" fill="var(--accent-gold)" stroke="none" className="mist-particle-2" />

                            <rect x="42" y="16" width="16" height="10" rx="2" />
                            <rect x="45" y="26" width="10" height="4" fill="var(--accent-gold)" />
                            <path d="M26 38 C26 33 30 30 50 30 C70 30 74 33 74 38 V80 C74 85 70 88 50 88 C30 88 26 85 26 80 Z" />
                            <line x1="38" y1="31" x2="38" y2="86" strokeWidth="0.75" strokeDasharray="3 1" />
                            <line x1="62" y1="31" x2="62" y2="86" strokeWidth="0.75" strokeDasharray="3 1" />
                            <rect x="36" y="46" width="28" height="26" rx="1" strokeWidth="1" />
                            <text x="50" y="58" fill="var(--accent-gold)" stroke="none" fontSize="6" fontFamily="serif" textAnchor="middle" letterSpacing="0.5">ELIXYR</text>
                            <text x="50" y="65" fill="var(--text-secondary)" stroke="none" fontSize="3.5" fontFamily="sans-serif" textAnchor="middle">PARFUM</text>
                          </svg>
                        );
                      } else {
                        return (
                          <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke="#e74c3c" strokeWidth="1.5">
                            <style>{`
                              @keyframes pulseWarn {
                                0% { opacity: 0.6; }
                                50% { opacity: 1; }
                                100% { opacity: 0.6; }
                              }
                              .anim-warn {
                                animation: pulseWarn 2.5s ease-in-out infinite;
                              }
                            `}</style>
                            <rect x="20" y="20" width="60" height="60" rx="3" stroke="var(--border-primary)" />
                            <g className="anim-warn">
                              <path d="M50 32 L72 70 H28 Z" stroke="#e74c3c" strokeWidth="2" strokeLinejoin="round" />
                              <line x1="50" y1="45" x2="50" y2="58" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" />
                              <circle cx="50" cy="64" r="1.5" fill="#e74c3c" stroke="none" />
                            </g>
                          </svg>
                        );
                      }
                    })()}
                  </div>
                );
              };

              const getStatusContent = () => {
                if (status === 'received' || status === 'pending') {
                  return {
                    title: "Order Received",
                    desc: "Your order has been received and is currently being processed by our team.",
                    color: "var(--accent-gold)"
                  };
                } else if (status === 'stock reserved' || status.includes('reserve')) {
                  return {
                    title: "Cellar Stock Reserved",
                    desc: "Your signature fragrance has been successfully reserved from our boutique cellar.",
                    color: "var(--accent-gold)"
                  };
                } else if (status === 'ready for dispatch' || status.includes('ready')) {
                  return {
                    title: "Order Prepared",
                    desc: "Your order has been hand-packaged in our signature box and is ready for dispatch.",
                    color: "var(--accent-gold)"
                  };
                } else if (status === 'out for delivery' || status.includes('out')) {
                  return {
                    title: "Out for Delivery",
                    desc: "Your package is currently out for delivery with our courier partner. Please ensure your contact number is active.",
                    color: "var(--accent-gold)"
                  };
                } else if (status === 'delivered') {
                  return {
                    title: "Package Delivered",
                    desc: "Delivered. We hope your new signature scent inspires you.",
                    color: "#2ecc71"
                  };
                } else { // Cancelled or Rejected
                  return {
                    title: "Order Cancelled",
                    desc: "Your order has been cancelled. For further details, please contact our WhatsApp Concierge at +971 52 123 4567 or email us at concierge@elixyr.ae.",
                    color: "#e74c3c"
                  };
                }
              };

              const details = getStatusContent();

              return (
                <div className="checkout-form-card animate-fade-in" style={{marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px', alignItems: 'center', textAlign: 'center'}}>
                  {/* Visual Art Box */}
                  <div style={{padding: '24px 0', borderBottom: '1px solid var(--border-primary)'}}>
                    {renderPremiumGraphic()}
                    <h3 className="font-serif" style={{fontSize: '1.8rem', marginTop: '16px', color: details.color}}>{details.title}</h3>
                    <p style={{fontSize: '1rem', maxWidth: '480px', margin: '8px auto 0', color: 'var(--text-secondary)', lineHeight: '1.5'}}>
                      {details.desc}
                    </p>
                  </div>

                  {/* Airway Bill (AWB) Logistics details if booked */}
                  {activeTrackingOrder.awb_number && (
                    <div style={{
                      backgroundColor: 'var(--bg-secondary)', 
                      padding: '16px', 
                      borderRadius: '2px', 
                      border: '1px solid var(--border-primary)',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      lineHeight: '1.6'
                    }}>
                      <span className="section-category" style={{fontSize: '0.6rem', color: 'var(--accent-gold)', display: 'block', marginBottom: '4px'}}>AWB LOGISTICS CARRIER</span>
                      <strong>Waybill Number:</strong> <span style={{fontFamily: 'monospace', letterSpacing: '1px'}}>{activeTrackingOrder.awb_number}</span><br />
                      <strong>Courier Tracker:</strong> <a href={activeTrackingOrder.tracking_link} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-gold)', textDecoration: 'underline'}}>Track Courier Live Link ➔</a>
                    </div>
                  )}

                  {/* Summary grid of products purchased */}
                  <div style={{textAlign: 'left', fontSize: '0.8rem', borderTop: '1px solid var(--border-primary)', paddingTop: '20px'}}>
                    <span className="section-category" style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px'}}>ORDER DETAILS</span>
                    <strong>Customer's Name:</strong> {activeTrackingOrder.clientName || activeTrackingOrder.client_name}<br />
                    <strong>WhatsApp Phone:</strong> {activeTrackingOrder.phone}<br />
                    {activeTrackingOrder.email && (
                      <><strong>Client Email:</strong> {activeTrackingOrder.email}<br /></>
                    )}
                    <strong>Delivery Address:</strong> {activeTrackingOrder.emirate}<br />
                    <strong>Order Total:</strong> {activeTrackingOrder.total || activeTrackingOrder.total_amount} AED<br /><br />
                    
                    <span className="section-category" style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px'}}>ITEMS SLIP</span>
                    {activeTrackingOrder.items && activeTrackingOrder.items.map((item, idx) => (
                      <div key={idx} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px dashed var(--border-primary)', paddingBottom: '4px'}}>
                        <span>• {item.name} (x{item.qty})</span>
                        <span>{item.price * item.qty} AED</span>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })()}
          </div>
        </main>
      )}

      {/* ROUTE 3: PREMIUM POST-PURCHASE REDIRECT - PAYMENT SOON ROUTE ('/payment-soon') */}
      {currentRoute === '/payment-soon' && finalizedOrder && (
        <main className="container" style={{padding: 'var(--space-2xl) 0', textAlign: 'center'}}>
          <div style={{maxWidth: '650px', margin: '0 auto'}}>
            <h1 className="font-serif" style={{fontSize: '3rem', marginTop: '40px', marginBottom: '8px'}}>Gateway Connection</h1>
            <p style={{fontSize: '0.95rem', color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '600', marginBottom: '24px'}}>
              N-Genius Payment Portal Coming Soon
            </p>
            
            <div className="admin-form-box" style={{textAlign: 'left', marginBottom: '32px'}}>
              <h4 className="font-serif" style={{fontSize: '1.25rem', marginBottom: '8px'}}>Your Boutique Order Slot is Reserved</h4>
              <p style={{fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)'}}>
                We have securely logged order number **{finalizedOrder.orderNumber}** in our registry. Our regional delivery concierge will contact you shortly to complete card transactions securely. You may print your finalized invoice receipt below for your records.
              </p>
            </div>

            {/* Print-Only isolated slip rendering */}
            <div className="receipt-wrapper" style={{textAlign: 'left', marginBottom: '24px'}}>
              <div className="boutique-receipt">
                <div className="receipt-header">
                  <div className="receipt-logo">ELIXYR</div>
                  <div className="receipt-type">BOUTIQUE ORDER INVOICE</div>
                  <div className="receipt-order-no">{finalizedOrder.orderNumber}</div>
                </div>

                <div className="receipt-meta-grid">
                  <div className="receipt-meta-item">
                    <span className="receipt-meta-label">DATE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.date}</span>
                  </div>
                  <div className="receipt-meta-item">
                    <span className="receipt-meta-label">EMIRATE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.emirate.split(' ')[0]}</span>
                  </div>
                  <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                    <span className="receipt-meta-label">CLIENT:</span>
                    <span className="receipt-meta-val">{finalizedOrder.clientName}</span>
                  </div>
                  <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                    <span className="receipt-meta-label">PHONE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.phone}</span>
                  </div>
                </div>

                <div className="receipt-items-list">
                  {finalizedOrder.items.map(item => (
                    <div key={item.id} className="receipt-item-row">
                      <span>{item.name}</span>
                      <span className="receipt-item-qty">x{item.qty}</span>
                      <span className="receipt-item-total">{item.price * item.qty} AED</span>
                    </div>
                  ))}
                </div>

                <div className="receipt-total-section">
                  <div className="receipt-total-row">
                    <span>SUBTOTAL:</span>
                    <span>{finalizedOrder.subtotal} AED</span>
                  </div>
                  <div className="receipt-total-row">
                    <span>SHIPPING DELIVERY:</span>
                    <span>{finalizedOrder.delivery} AED</span>
                  </div>
                  <div className="receipt-total-row grand-total">
                    <span>TOTAL AMOUNT:</span>
                    <span>{finalizedOrder.total} AED</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{display: 'flex', gap: '16px', justifyContent: 'center'}}>
              <button className="btn btn-primary" onClick={() => window.print()}>
                PRINT ORDER RECEIPT
              </button>
              <button className="btn btn-secondary" onClick={() => navigateTo('/')}>
                Return to Shop
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ROUTE 4: PREMIUM POST-PURCHASE REDIRECT - COD ROUTE ('/cod-soon') */}
      {currentRoute === '/cod-soon' && finalizedOrder && (
        <main className="container" style={{padding: 'var(--space-2xl) 0', textAlign: 'center'}}>
          <div style={{maxWidth: '650px', margin: '0 auto'}}>
            <h1 className="font-serif" style={{fontSize: '3rem', marginTop: '40px', marginBottom: '8px'}}>Trail Reserved</h1>
            <p style={{fontSize: '0.95rem', color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '600', marginBottom: '24px'}}>
              Boutique Delivery Confirmed
            </p>
            
            <div className="admin-form-box" style={{textAlign: 'left', marginBottom: '32px'}}>
              <h4 className="font-serif" style={{fontSize: '1.25rem', marginBottom: '8px'}}>Your Order is Dispatched for Delivery</h4>
              <p style={{fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)'}}>
                Your order number **{finalizedOrder.orderNumber}** has been securely passed to our regional delivery courier. Our team will bring your premium box directly to your address, collecting payment securely on hand-off. Thank you for shopping with Elixyr!
              </p>
            </div>

            {/* Print-Only isolated slip rendering */}
            <div className="receipt-wrapper" style={{textAlign: 'left', marginBottom: '24px'}}>
              <div className="boutique-receipt">
                <div className="receipt-header">
                  <div className="receipt-logo">ELIXYR</div>
                  <div className="receipt-type">BOUTIQUE ORDER INVOICE</div>
                  <div className="receipt-order-no">{finalizedOrder.orderNumber}</div>
                </div>

                <div className="receipt-meta-grid">
                  <div className="receipt-meta-item">
                    <span className="receipt-meta-label">DATE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.date}</span>
                  </div>
                  <div className="receipt-meta-item">
                    <span className="receipt-meta-label">EMIRATE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.emirate.split(' ')[0]}</span>
                  </div>
                  <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                    <span className="receipt-meta-label">CLIENT:</span>
                    <span className="receipt-meta-val">{finalizedOrder.clientName}</span>
                  </div>
                  <div className="receipt-meta-item" style={{gridColumn: 'span 2'}}>
                    <span className="receipt-meta-label">PHONE:</span>
                    <span className="receipt-meta-val">{finalizedOrder.phone}</span>
                  </div>
                </div>

                <div className="receipt-items-list">
                  {finalizedOrder.items.map(item => (
                    <div key={item.id} className="receipt-item-row">
                      <span>{item.name}</span>
                      <span className="receipt-item-qty">x{item.qty}</span>
                      <span className="receipt-item-total">{item.price * item.qty} AED</span>
                    </div>
                  ))}
                </div>

                <div className="receipt-total-section">
                  <div className="receipt-total-row">
                    <span>SUBTOTAL:</span>
                    <span>{finalizedOrder.subtotal} AED</span>
                  </div>
                  <div className="receipt-total-row">
                    <span>SHIPPING DELIVERY:</span>
                    <span>{finalizedOrder.delivery} AED</span>
                  </div>
                  <div className="receipt-total-row grand-total">
                    <span>TOTAL AMOUNT:</span>
                    <span>{finalizedOrder.total} AED</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{display: 'flex', gap: '16px', justifyContent: 'center'}}>
              <button className="btn btn-primary" onClick={() => window.print()}>
                PRINT ORDER RECEIPT
              </button>
              <button className="btn btn-secondary" onClick={() => navigateTo('/')}>
                Return to Shop
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ROUTE: PRIVACY POLICY VIEW ('/privacy') */}
      {currentRoute === '/privacy' && (
        <main className="container" style={{padding: 'var(--space-2xl) 0', maxWidth: '800px'}}>
          <div style={{textAlign: 'left', marginTop: '40px'}}>
            <span className="section-category">LEGAL PORTAL</span>
            <h1 className="font-serif" style={{fontSize: '3rem', marginBottom: '24px', fontWeight: '300'}}>Privacy Policy</h1>
            <p style={{color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.75rem', fontWeight: '600', marginBottom: '40px'}}>Last Updated: May 2026</p>
            
            <div style={{color: 'var(--text-secondary)', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '30px', fontSize: '0.85rem'}}>
              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>1. Collection of Information</h4>
                <p>
                  At Elixyr, we respect your absolute right to privacy. We only collect standard checkout details (your Full Name, WhatsApp phone number, email address, and Emirate of delivery) to fulfill your bespoke fragrance orders and contact you via our secure delivery concierge.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>2. Data Security & Storage</h4>
                <p>
                  Your boutique order details are logged using enterprise-grade, encrypted cloud databases (Supabase). We employ strict Row Level Security (RLS) protocols to ensure that order history is fully protected and accessible only by authorized boutique dispatch personnel.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>3. WhatsApp & Concierge Communications</h4>
                <p>
                  By completing a checkout slip, you consent to our boutique representatives contacting you via WhatsApp or phone solely to coordinate high-priority shipping updates, COD card collection, or delivery windows. We never sell, lease, or distribute your phone number to third-party marketers.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>4. Cookies & Analytics</h4>
                <p>
                  We use cookies and light browser storage components solely to save your local shopping bag quantities, checkout form values, and custom theme configurations (light/dark mode toggle) to elevate your digital experience.
                </p>
              </section>
            </div>

            <div style={{marginTop: '50px'}}>
              <button className="btn btn-secondary" onClick={() => navigateTo('/')} style={{padding: '12px 30px', fontSize: '0.7rem', letterSpacing: '2px'}}>
                RETURN TO SHOP
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ROUTE: TERMS OF SERVICE VIEW ('/terms') */}
      {currentRoute === '/terms' && (
        <main className="container" style={{padding: 'var(--space-2xl) 0', maxWidth: '800px'}}>
          <div style={{textAlign: 'left', marginTop: '40px'}}>
            <span className="section-category">LEGAL PORTAL</span>
            <h1 className="font-serif" style={{fontSize: '3rem', marginBottom: '24px', fontWeight: '300'}}>Terms of Service</h1>
            <p style={{color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.75rem', fontWeight: '600', marginBottom: '40px'}}>Last Updated: May 2026</p>
            
            <div style={{color: 'var(--text-secondary)', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '30px', fontSize: '0.85rem'}}>
              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>1. Small-Batch Craftsmanship</h4>
                <p>
                  Elixyr fragrances are curated, blended, and hand-assembled in small batches using premium raw materials and high concentrations of organic agarwood and ingredients. Because of this natural extraction method, subtle variations in color, bottle weight, and raw notes are normal and serve as a certificate of small-batch authenticity.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>2. Order Fulfillments & Delivery</h4>
                <p>
                  Orders placed through our digital concierge are passed to our regional courier partners. Delivery times and shipping fees (ranging from 15 AED in Dubai/Sharjah to 25 AED in Fujairah/RAK) are estimates. Hand-offs are conducted securely by our professional courier staff.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>3. Cash on Delivery (COD) Transactions</h4>
                <p>
                  For COD checkout routes, you agree to collect the order and pay the full invoice amount at the designated delivery address. Failure to pay or receive pre-arranged shipments may result in a suspension of boutique ordering slots for future launches.
                </p>
              </section>

              <section>
                <h4 className="font-serif" style={{color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', fontWeight: '400'}}>4. Customer Satisfaction & Returns</h4>
                <p>
                  Due to the hygienic nature of luxury extraits, opened items cannot be returned. We highly recommend adding one of our Discovery Set samplers to your cart to experience our collections before opening full bottles.
                </p>
              </section>
            </div>

            <div style={{marginTop: '50px'}}>
              <button className="btn btn-secondary" onClick={() => navigateTo('/')} style={{padding: '12px 30px', fontSize: '0.7rem', letterSpacing: '2px'}}>
                RETURN TO SHOP
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ROUTE 5: EXECUTIVE STAFF CONTROL CENTER (ADMIN) */}
      {currentRoute === '/admin-portal' && (
        <div className="admin-portal-overlay">
          
          {/* Lock Screen */}
          {!isAdminAuthenticated ? (
            <div className="container" style={{display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center'}}>
              <div className="admin-lock-card">
                <h3 className="font-serif" style={{textAlign: 'center', marginBottom: '8px', fontSize: '1.8rem'}}>Staff Verification</h3>
                <p style={{fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '20px'}}>
                  Enter the secure administrative passcode to unlock the dashboard.
                </p>
                <form onSubmit={handleAdminAuth}>
                  <div className="form-group">
                    <label className="form-label">PASSCODE</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPasscode ? "text" : "password"} 
                        className="form-input" 
                        placeholder="••••••••" 
                        required 
                        value={adminPasscode}
                        onChange={e => setAdminPasscode(e.target.value)}
                        style={{ paddingRight: '55px' }}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPasscode(!showPasscode)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-tertiary)',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          letterSpacing: '0.05em',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          userSelect: 'none'
                        }}
                      >
                        {showPasscode ? "HIDE" : "SHOW"}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="btn-submit" style={{ marginTop: '16px' }}>VERIFY ACCESS</button>
                </form>
                <button 
                  className="btn btn-secondary" 
                  style={{width: '100%', marginTop: '8px', fontSize: '0.65rem'}}
                  onClick={() => {
                    if (scopedProductSlug) {
                      navigateTo(`/${scopedProductSlug}`);
                    } else {
                      navigateTo('/');
                    }
                  }}
                >
                  BACK TO SITE
                </button>
                <div style={{textAlign: 'center', fontSize: '0.65rem', marginTop: '12px', color: 'var(--text-tertiary)'}}>
                  Passcode validation is 100% secure, verified on the fly using native cryptographic SHA-256 one-way hashing checks.
                </div>
              </div>
            </div>
          ) : (
            /* Split-Panel dashboard */
            <div className="admin-workspace-grid">
              
              {/* Sidebar Panel */}
              <aside className="admin-sidebar">
                <div>
                  <div className="sidebar-logo">ELIXYR</div>
                  <ul className="sidebar-menu">
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('overview')}
                      >
                        ⚜️ Dashboard Overview
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'orders' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('orders')}
                      >
                        🛍️ Customer Orders
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'products' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('products')}
                      >
                        📦 Fragrance Catalog
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'blogs' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('blogs')}
                      >
                        ✍️ Journal Editor
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'categories' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('categories')}
                      >
                        🏷️ Product Categories
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'statuses' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('statuses')}
                      >
                        ⚙️ Order Statuses
                      </button>
                    </li>
                    <li>
                      <button 
                        className={`sidebar-btn ${adminActiveTab === 'crm' ? 'active' : ''}`}
                        onClick={() => setAdminActiveTab('crm')}
                      >
                        👥 VIP Client CRM
                      </button>
                    </li>
                  </ul>
                </div>
                
                <div className="sidebar-footer">
                  <button className="sidebar-btn" onClick={handleAdminLogout} style={{color: '#e74c3c'}}>
                    🚪 Exit Staff Portal
                  </button>
                </div>
              </aside>

              {/* Main Panel Content */}
              <main className="admin-main-panel">
                <div className="admin-panel-header">
                  <h2 className="font-serif">
                    {adminActiveTab === 'overview' && '⚜️ Executive Overview'}
                    {adminActiveTab === 'orders' && '🛍️ Customer Orders Registry'}
                    {adminActiveTab === 'products' && '📦 Fragrance Catalog Control'}
                    {adminActiveTab === 'blogs' && '✍️ Editorial Journal'}
                    {adminActiveTab === 'categories' && '🏷️ Product Categories Manager'}
                    {adminActiveTab === 'statuses' && '⚙️ Order Fulfillment Statuses'}
                    {adminActiveTab === 'crm' && '👥 VIP Client CRM & Profiles'}
                  </h2>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                    <span className="admin-status-pill" style={{
                      margin: 0,
                      backgroundColor: database.isCloudConnected() ? 'rgba(46, 204, 113, 0.08)' : 'rgba(230, 126, 34, 0.08)',
                      color: database.isCloudConnected() ? '#2ecc71' : '#e67e22',
                      border: database.isCloudConnected() ? '1px solid rgba(46, 204, 113, 0.15)' : '1px solid rgba(230, 126, 34, 0.15)',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: database.isCloudConnected() ? '#2ecc71' : '#e67e22',
                        boxShadow: database.isCloudConnected() ? '0 0 8px #2ecc71' : '0 0 8px #e67e22',
                        display: 'inline-block'
                      }} />
                      {database.isCloudConnected() ? '⚜️ CLOUD ACTIVE' : '⚠️ LOCAL FALLBACK'}
                    </span>
                    <span style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', letterSpacing: '1px'}}>
                      SESSION SECURED (SHA-256)
                    </span>
                  </div>
                </div>

                {/* Dashboard Tab 1: OVERVIEW */}
                {adminActiveTab === 'overview' && (
                  <div>
                    <div className="admin-stats-row">
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Active Fragrances</div>
                        <div className="stat-card-value">{products.length}</div>
                        <div className="stat-card-note" style={{color: '#2ecc71'}}>Catalog is live & indexed</div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Boutique Orders</div>
                        <div className="stat-card-value">{orders.length}</div>
                        <div className="stat-card-note" style={{color: 'var(--accent-gold)'}}>
                          {orders.filter(o => o.status === 'pending').length} pending dispatch
                        </div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Journal Articles</div>
                        <div className="stat-card-value">{blogs.length}</div>
                        <div className="stat-card-note">Informed luxury buyers</div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Stock Status Alerts</div>
                        <div className="stat-card-value" style={{color: (lowStockCount + outOfStockCount) > 0 ? '#e67e22' : 'inherit'}}>
                          {lowStockCount + outOfStockCount}
                        </div>
                        <div className="stat-card-note">
                          {outOfStockCount} Out of stock, {lowStockCount} Low stock
                        </div>
                      </div>
                    </div>

                    {/* Removed Boutique System Log */}
                  </div>
                )}

                {/* Dashboard Tab 2: PRODUCTS */}
                {adminActiveTab === 'products' && (
                  <div>
                    {/* Creation Form Block */}
                    <div className="admin-form-box">
                      <h4 className="font-serif admin-form-title" style={{fontSize: '1.4rem'}}>Create Custom Fragrance SKU</h4>
                      <form onSubmit={handleCreateProduct} className="admin-modal-form">
                        <div className="form-group-row">
                          <div className="form-group">
                            <label className="form-label">PRODUCT NAME</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              required 
                              placeholder="e.g. Creed"
                              value={newProductForm.name}
                              onChange={e => setNewProductForm({...newProductForm, name: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                              <label className="form-label" style={{marginBottom: 0}}>CATEGORY</label>
                              <button type="button" className="admin-tag-toggle" onClick={() => setNewProductForm({...newProductForm, isCustomCategory: !newProductForm.isCustomCategory, customCategory: ''})}>
                                {newProductForm.isCustomCategory ? '← Use Preset' : '+ New Category'}
                              </button>
                            </div>
                            {newProductForm.isCustomCategory ? (
                              <input
                                type="text"
                                className="form-input"
                                required
                                placeholder="e.g. FLORAL ABSOLUTES"
                                value={newProductForm.customCategory}
                                onChange={e => setNewProductForm({...newProductForm, customCategory: e.target.value})}
                              />
                            ) : (
                              <select 
                                className="form-input"
                                value={newProductForm.category}
                                onChange={e => setNewProductForm({...newProductForm, category: e.target.value})}
                              >
                                {categories.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="form-group-row">
                          <div className="form-group">
                            <label className="form-label">PRICE (AED)</label>
                            <input 
                              type="number" 
                              className="form-input" 
                              required 
                              placeholder="e.g. 195"
                              value={newProductForm.price}
                              onChange={e => setNewProductForm({...newProductForm, price: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">SCENT FAMILY</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              required 
                              placeholder="e.g. Fresh Woody"
                              value={newProductForm.scent_family}
                              onChange={e => setNewProductForm({...newProductForm, scent_family: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="form-group-row">
                          <div className="form-group">
                            <label className="form-label">SILLAGE PROJECTION (0 - 100%)</label>
                            <input 
                              type="number" 
                              min="0" max="100"
                              className="form-input" 
                              required 
                              value={newProductForm.sillage}
                              onChange={e => setNewProductForm({...newProductForm, sillage: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">LONGEVITY HOURS (0 - 100%)</label>
                            <input 
                              type="number" 
                              min="0" max="100"
                              className="form-input" 
                              required 
                              value={newProductForm.longevity}
                              onChange={e => setNewProductForm({...newProductForm, longevity: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">GENDER PROFILE (0-100% MASCULINE)</label>
                            <input 
                              type="number" 
                              min="0" max="100"
                              className="form-input" 
                              required 
                              value={newProductForm.gender}
                              onChange={e => setNewProductForm({...newProductForm, gender: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="form-group-row">
                          <div className="form-group">
                            <label className="form-label">BATCH DETAILS</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              required 
                              placeholder="e.g. Batch #001 — Fresh poured"
                              value={newProductForm.batch_details}
                              onChange={e => setNewProductForm({...newProductForm, batch_details: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">EXCLUSIVITY/SCARCITY TAG</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              required 
                              placeholder="e.g. Premium Batch — Limited Reserve"
                              value={newProductForm.scarcity_note}
                              onChange={e => setNewProductForm({...newProductForm, scarcity_note: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">KEY NOTES LIST (COMMA SEPARATED)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            required 
                            placeholder="Bergamot, Jasmine, White Oud"
                            value={newProductForm.key_notes}
                            onChange={e => setNewProductForm({...newProductForm, key_notes: e.target.value})}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">SCENT BLENDING MIX FORMULA</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            required 
                            placeholder="Bergamot essence (30%), White Musk, agarwood extract"
                            value={newProductForm.scent_mixes}
                            onChange={e => setNewProductForm({...newProductForm, scent_mixes: e.target.value})}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">STORY DESCRIPTION</label>
                          <textarea 
                            className="form-input" 
                            style={{minHeight: '80px'}}
                            required 
                            placeholder="Poetic sensory narrative detailing the story of this scent..."
                            value={newProductForm.description}
                            onChange={e => setNewProductForm({...newProductForm, description: e.target.value})}
                          />
                        </div>

                        {/* Premium Drag-and-Drop Image Upload Zone */}
                        <div className="form-group">
                          <label className="form-label" style={{marginBottom: '8px'}}>PRODUCT IMAGES</label>
                          <div className="admin-file-upload-zone">
                            <span className="admin-upload-icon">+</span>
                            <span className="admin-upload-text">Upload Fragrance Images</span>
                            <span className="admin-upload-subtext">Drag & drop files or click to browse (Max 800px compressed)</span>
                            <input 
                              type="file" 
                              multiple 
                              accept="image/*" 
                              onChange={async (e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  const filesArray = Array.from(e.target.files);
                                  try {
                                    const processedUrls = await Promise.all(
                                      filesArray.map(file => compressAndProcessImage(file))
                                    );
                                    setNewProductForm(prev => ({
                                      ...prev,
                                      images: [...(prev.images || []).filter(img => img && !img.startsWith('http://') && !img.startsWith('https://') && !img.includes('unsplash.com')), ...processedUrls]
                                    }));
                                  } catch (error) {
                                    console.error("Error processing images:", error);
                                    alert("Could not process some images. Please try another file.");
                                  }
                                }
                              }} 
                            />
                          </div>

                          {/* Dynamic Warning Indicator */}
                          {(newProductForm.images || []).length > 3 && (
                            <p className="admin-upload-warning">
                              ⚠️ Premium Curation: Three images are recommended for optimal boutique display.
                            </p>
                          )}

                          {/* Image preview thumbnails */}
                          {(newProductForm.images || []).length > 0 && (
                            <div className="admin-img-preview-grid">
                              {(newProductForm.images || []).map((img, idx) => (
                                <div key={idx} className="admin-img-preview-card">
                                  <img src={img} alt={`Preview ${idx + 1}`} />
                                  <button 
                                    type="button" 
                                    className="admin-img-preview-delete"
                                    onClick={() => {
                                      const updatedImgs = newProductForm.images.filter((_, i) => i !== idx);
                                      setNewProductForm({ ...newProductForm, images: updatedImgs });
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn-submit" style={{marginTop: '0'}}>PUBLISH NEW SKU</button>
                      </form>
                    </div>

                    {/* Products Grid table list */}
                    <div className="admin-table-box">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Image</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Stock Status</th>
                            <th>Stock Management</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.map(p => (
                            <tr key={p.id}>
                              <td>
                                <img src={p.images[0]} style={{width: '44px', height: '44px', objectFit: 'cover', borderRadius: '2px'}} />
                              </td>
                              <td style={{fontWeight: '600', color: 'var(--text-primary)'}}>
                                <a href={`/${p.slug}`} target="_blank" style={{textDecoration: 'underline'}}>{p.name}</a>
                              </td>
                              <td style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', letterSpacing: '0.5px'}}>{p.category}</td>
                              <td>
                                <input 
                                  type="number" 
                                  defaultValue={p.price} 
                                  className="form-input" 
                                  style={{width: '80px', padding: '6px'}}
                                  onBlur={(e) => handleUpdateProductPrice(p.id, e.target.value)}
                                />
                              </td>
                              <td>
                                <span className={`admin-status-pill ${
                                  p.stock_status === 'in_stock' ? 'status-instock' :
                                  p.stock_status === 'low_stock' ? 'status-lowstock' : 'status-nostock'
                                }`}>
                                  {p.stock_status.replace('_', ' ')}
                                </span>
                              </td>
                              <td>
                                <select 
                                  className="form-input" 
                                  style={{padding: '6px', fontSize: '0.7rem'}}
                                  value={p.stock_status}
                                  onChange={(e) => handleUpdateProductStock(p.id, e.target.value)}
                                >
                                  <option value="in_stock">In Stock</option>
                                  <option value="low_stock">Low Stock</option>
                                  <option value="out_of_stock">Out of Stock</option>
                                </select>
                              </td>
                              <td>
                                <div style={{display: 'flex', gap: '8px'}}>
                                  <button 
                                    className="admin-icon-btn edit" 
                                    onClick={() => setEditingProduct(p)}
                                    style={{fontSize: '0.7rem', textDecoration: 'underline', color: 'var(--accent-gold)'}}
                                  >
                                    [EDIT]
                                  </button>
                                  <button 
                                    className="admin-icon-btn delete" 
                                    onClick={() => handleDeleteProduct(p.id)}
                                    style={{fontSize: '0.7rem', textDecoration: 'underline', color: '#e74c3c'}}
                                  >
                                    [DELETE]
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dashboard Tab 3: BLOGS */}
                {adminActiveTab === 'blogs' && (
                  <div>
                    {/* Creation Blog Block */}
                    <div className="admin-form-box">
                      <h4 className="font-serif admin-form-title" style={{fontSize: '1.4rem'}}>Publish Journal Article</h4>
                      <form onSubmit={handleCreateBlog} className="admin-modal-form">
                        <div className="form-group-row">
                          <div className="form-group">
                            <label className="form-label">ARTICLE TITLE</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              required 
                              placeholder="e.g. Applying Scent with Intent"
                              value={newBlogForm.title}
                              onChange={e => setNewBlogForm({...newBlogForm, title: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                              <label className="form-label" style={{marginBottom: 0}}>CATEGORY</label>
                              <button type="button" className="admin-tag-toggle" onClick={() => setNewBlogForm({...newBlogForm, isCustomCategory: !newBlogForm.isCustomCategory, customCategory: ''})}>
                                {newBlogForm.isCustomCategory ? '← Use Preset' : '+ New Category'}
                              </button>
                            </div>
                            {newBlogForm.isCustomCategory ? (
                              <input
                                type="text"
                                className="form-input"
                                required
                                placeholder="e.g. INGREDIENTS"
                                value={newBlogForm.customCategory}
                                onChange={e => setNewBlogForm({...newBlogForm, customCategory: e.target.value})}
                              />
                            ) : (
                              <select 
                                className="form-input"
                                value={newBlogForm.category}
                                onChange={e => setNewBlogForm({...newBlogForm, category: e.target.value})}
                              >
                                <option>BUYING GUIDE</option>
                                <option>FRAGRANCE NOTES</option>
                                <option>GIFTING</option>
                                <option>RITUAL</option>
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">PREVIEW EXCERPT</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            required 
                            placeholder="Write a concise teaser hook for home page grids..."
                            value={newBlogForm.excerpt}
                            onChange={e => setNewBlogForm({...newBlogForm, excerpt: e.target.value})}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">ARTICLE BODY CONTENT</label>
                          <textarea 
                            className="form-input" 
                            style={{minHeight: '160px'}}
                            required 
                            placeholder="Draft the elegant educational content narrative..."
                            value={newBlogForm.content}
                            onChange={e => setNewBlogForm({...newBlogForm, content: e.target.value})}
                          />
                        </div>

                        {/* Cover image + extra images */}
                        <div className="form-group">
                          <label className="form-label" style={{marginBottom: '8px'}}>COVER IMAGE</label>
                          <div className="admin-file-upload-zone" style={{padding: '16px'}}>
                            <span className="admin-upload-icon">+</span>
                            <span className="admin-upload-text">Upload Cover Image</span>
                            <span className="admin-upload-subtext">Click to choose main editorial photo</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={async (e) => {
                                if (e.target.files && e.target.files[0]) {
                                  try {
                                    const processedUrl = await compressAndProcessImage(e.target.files[0]);
                                    setNewBlogForm(prev => ({
                                      ...prev,
                                      image_url: processedUrl
                                    }));
                                  } catch (error) {
                                    console.error("Error processing image:", error);
                                    alert("Could not process the cover image. Please try another file.");
                                  }
                                }
                              }} 
                            />
                          </div>
                          {newBlogForm.image_url && (
                            <div className="admin-img-preview-grid">
                              <div className="admin-img-preview-card">
                                <img src={newBlogForm.image_url} alt="Cover Preview" />
                                <button 
                                  type="button" 
                                  className="admin-img-preview-delete"
                                  onClick={() => setNewBlogForm({ ...newBlogForm, image_url: '' })}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{marginBottom: '8px'}}>GALLERY/EXTRA IMAGES</label>
                          <div className="admin-file-upload-zone" style={{padding: '16px'}}>
                            <span className="admin-upload-icon">+</span>
                            <span className="admin-upload-text">Upload Gallery Photos</span>
                            <span className="admin-upload-subtext">Drag & drop files or click to browse</span>
                            <input 
                              type="file" 
                              multiple 
                              accept="image/*" 
                              onChange={async (e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  const filesArray = Array.from(e.target.files);
                                  try {
                                    const processedUrls = await Promise.all(
                                      filesArray.map(file => compressAndProcessImage(file))
                                    );
                                    setNewBlogForm(prev => ({
                                      ...prev,
                                      extra_images: [...(prev.extra_images || []), ...processedUrls]
                                    }));
                                  } catch (error) {
                                    console.error("Error processing gallery images:", error);
                                    alert("Could not process some gallery images. Please try another file.");
                                  }
                                }
                              }} 
                            />
                          </div>

                          {/* Dynamic Warning Indicator */}
                          {((newBlogForm.image_url ? 1 : 0) + (newBlogForm.extra_images || []).length) > 1 && (
                            <p className="admin-upload-warning">
                              ⚠️ Editorial Layout: One cover image is recommended for pristine lifestyle guides.
                            </p>
                          )}

                          {/* Extra Images Preview */}
                          {(newBlogForm.extra_images || []).length > 0 && (
                            <div className="admin-img-preview-grid">
                              {(newBlogForm.extra_images || []).map((img, idx) => (
                                <div key={idx} className="admin-img-preview-card">
                                  <img src={img} alt={`Gallery Preview ${idx + 1}`} />
                                  <button 
                                    type="button" 
                                    className="admin-img-preview-delete"
                                    onClick={() => {
                                      const updatedImgs = newBlogForm.extra_images.filter((_, i) => i !== idx);
                                      setNewBlogForm({ ...newBlogForm, extra_images: updatedImgs });
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn-submit" style={{marginTop: '0'}}>PUBLISH ARTICLE</button>
                      </form>
                    </div>

                    {/* Blogs registry table */}
                    <div className="admin-table-box">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Article Title</th>
                            <th>Teaser Summary</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blogs.map(b => (
                            <tr key={b.id}>
                              <td style={{color: 'var(--accent-gold)', fontWeight: '600', fontSize: '0.7rem', letterSpacing: '0.5px'}}>{b.category}</td>
                              <td style={{fontWeight: '600', color: 'var(--text-primary)'}}>{b.title}</td>
                              <td style={{color: 'var(--text-tertiary)', fontSize: '0.75rem'}}>{b.excerpt}</td>
                              <td>
                                <div style={{display: 'flex', gap: '8px'}}>
                                  <button 
                                    className="admin-icon-btn edit" 
                                    onClick={() => setEditingBlog({...b, extra_images: b.extra_images || []})}
                                    style={{fontSize: '0.7rem', textDecoration: 'underline', color: 'var(--accent-gold)'}}
                                  >
                                    [EDIT]
                                  </button>
                                  <button 
                                    className="admin-icon-btn delete" 
                                    onClick={() => handleDeleteBlog(b.id)}
                                    style={{fontSize: '0.7rem', textDecoration: 'underline', color: '#e74c3c'}}
                                  >
                                    [DELETE]
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dashboard Tab 4: ORDERS */}
                {adminActiveTab === 'orders' && (
                  <div>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                      <h3 className="admin-form-title" style={{margin: 0}}>Customer Orders Registry</h3>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <button
                          type="button"
                          className="admin-tag-toggle"
                          onClick={handleForceSync}
                          disabled={isSyncing}
                          style={{
                            padding: '8px 16px', 
                            fontSize: '0.75rem', 
                            backgroundColor: isSyncing ? 'rgba(255, 255, 255, 0.05)' : 'rgba(218, 165, 32, 0.06)', 
                            border: '1px solid rgba(218, 165, 32, 0.2)',
                            color: 'var(--accent-gold)',
                            cursor: isSyncing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {isSyncing ? '⚜️ SYNCING...' : '🔄 FORCE CLOUD SYNC'}
                        </button>
                        <button 
                          className="admin-tag-toggle" 
                          onClick={() => {
                            setManualOrderForm({
                              fullName: '',
                              phone: '+971',
                              email: '',
                              emirate: 'Dubai (15 AED)',
                              paymentMethod: 'WhatsApp Order Concierge',
                              items: []
                            });
                            setManualOrderError(null);
                            setIsCreatingOrder(true);
                          }}
                          style={{padding: '8px 16px', fontSize: '0.75rem'}}
                        >
                          + Create Manual Order
                        </button>
                      </div>
                    </div>

                    {syncNotification && (
                      <div style={{
                        padding: '12px 16px',
                        marginBottom: '16px',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        letterSpacing: '0.02em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        lineHeight: '1.4',
                        backgroundColor: 
                          syncNotification.type === 'success' ? 'rgba(46, 204, 113, 0.08)' :
                          syncNotification.type === 'error' ? 'rgba(192, 57, 43, 0.08)' : 'rgba(218, 165, 32, 0.08)',
                        color: 
                          syncNotification.type === 'success' ? '#2ecc71' :
                          syncNotification.type === 'error' ? '#c0392b' : 'var(--accent-gold)',
                        border: 
                          syncNotification.type === 'success' ? '1px solid rgba(46, 204, 113, 0.15)' :
                          syncNotification.type === 'error' ? '1px solid rgba(192, 57, 43, 0.15)' : '1px solid rgba(218, 165, 32, 0.15)',
                      }}>
                        <span>{syncNotification.type === 'success' ? '⚜️' : syncNotification.type === 'error' ? '⚠️' : '⚜️'}</span>
                        <span>{syncNotification.message}</span>
                      </div>
                    )}
                    <div className="admin-table-box">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Order Details</th>
                            <th>Client Info</th>
                            <th>Fragrances Selected</th>
                            <th>Total Due</th>
                            <th>Courier Logistics</th>
                            <th>Fulfillment Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.length === 0 ? (
                            <tr>
                              <td colSpan="7" style={{textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)'}}>
                                — No customer order records logged in boutique database —
                              </td>
                            </tr>
                          ) : (
                            orders.map(o => (
                              <tr key={o.id}>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{fontWeight: '700', color: 'var(--text-primary)'}}>{o.order_number}</div>
                                  <div style={{fontSize: '0.65rem', color: 'var(--text-tertiary)'}}>{o.created_at ? o.created_at.split('T')[0] : 'N/A'}</div>
                                </td>
                                <td style={{verticalAlign: 'top', fontSize: '0.8rem'}}>
                                  <div style={{fontWeight: '600', color: 'var(--text-primary)'}}>{o.client_name}</div>
                                  <div>WhatsApp: {o.phone}</div>
                                  {o.email && <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)'}}>{o.email}</div>}
                                </td>
                                <td style={{verticalAlign: 'top', fontSize: '0.75rem'}}>
                                  {Array.isArray(o.items) && o.items.map(item => (
                                    <div key={item.id} style={{marginBottom: '4px'}}>
                                      • {item.name} <span style={{color: 'var(--accent-gold)'}}>x{item.qty}</span>
                                    </div>
                                  ))}
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{fontWeight: '700', color: 'var(--accent-gold)'}}>{o.total_amount} AED</div>
                                  <div style={{fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase'}}>{o.payment_method.split(' ')[0]}</div>
                                  <div style={{fontSize: '0.65rem', color: 'var(--text-tertiary)'}}>Ship: {o.delivery_fee} AED</div>
                                </td>
                                <td style={{verticalAlign: 'top', fontSize: '0.75rem'}}>
                                  {o.tracking_number ? (
                                    <div>
                                      <div style={{color: '#2ecc71', fontWeight: '600'}}>AWB: {o.tracking_number}</div>
                                      <a href={o.tracking_link} target="_blank" rel="noreferrer" style={{textDecoration: 'underline', color: 'var(--accent-gold)'}}>
                                        Track Package
                                      </a>
                                    </div>
                                  ) : (
                                    <button 
                                      className="btn btn-primary" 
                                      style={{padding: '6px 12px', fontSize: '0.65rem', backgroundColor: 'var(--accent-gold)', border: 'none', color: '#0e0e0d'}}
                                      onClick={() => handleBookCourier(o)}
                                    >
                                      Book Delivery
                                    </button>
                                  )}
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{marginBottom: '8px'}}>
                                    <span className={`admin-status-pill ${
                                      o.status === 'delivered' ? 'status-instock' :
                                      o.status === 'cancelled' ? 'status-nostock' :
                                      o.status === 'pending' ? 'status-nostock' : 'status-lowstock'
                                    }`}>
                                      {(() => {
                                        const found = fulfillmentStatuses.find(s => s.key === o.status);
                                        return found ? found.label : o.status.replace('_', ' ');
                                      })()}
                                    </span>
                                  </div>
                                  <select 
                                    className="form-input" 
                                    style={{padding: '4px', fontSize: '0.65rem', width: '120px'}}
                                    value={o.status}
                                    onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                                  >
                                    {fulfillmentStatuses.map(s => (
                                      <option key={s.key} value={s.key}>{s.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                    {o.tracking_number && (
                                      <>
                                        <button 
                                          className="btn btn-secondary" 
                                          style={{padding: '4px 8px', fontSize: '0.6rem', textDecoration: 'underline'}}
                                          onClick={() => handleSendWhatsAppConcierge(o)}
                                        >
                                          WhatsApp SMS
                                        </button>
                                        <button 
                                          className="btn btn-secondary" 
                                          style={{padding: '4px 8px', fontSize: '0.6rem', textDecoration: 'underline'}}
                                          onClick={() => handleSendEmailReceipt(o)}
                                        >
                                          Email Dispatch
                                        </button>
                                      </>
                                    )}
                                    <button 
                                      className="admin-icon-btn edit" 
                                      onClick={() => setEditingOrder(o)}
                                      style={{fontSize: '0.65rem', textDecoration: 'underline', color: 'var(--accent-gold)'}}
                                    >
                                      [EDIT]
                                    </button>
                                    <button 
                                      className="admin-icon-btn delete" 
                                      onClick={() => handleDeleteOrder(o.id)}
                                      style={{fontSize: '0.65rem', textDecoration: 'underline', color: '#e74c3c'}}
                                    >
                                      [DELETE]
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dashboard Tab 5: CATEGORIES */}
                {adminActiveTab === 'categories' && (
                  <div>
                    {/* Add Category Panel */}
                    <div className="admin-form-container" style={{marginBottom: '24px', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'}}>
                      <h3 className="admin-form-title" style={{margin: 0, marginBottom: '12px'}}>+ Register New Category</h3>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const newCat = newCategoryInput.trim().toUpperCase();
                        if (!newCat) return;
                        if (categories.includes(newCat)) {
                          alert("This category already exists!");
                          return;
                        }
                        const updated = [...categories, newCat];
                        setCategories(updated);
                        localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(updated));
                        setNewCategoryInput('');
                        alert(`Category "${newCat}" successfully registered!`);
                      }} style={{display: 'flex', gap: '12px'}}>
                        <input 
                          type="text"
                          className="form-input"
                          placeholder="e.g. CITRUS AMBRETTE"
                          value={newCategoryInput}
                          onChange={e => setNewCategoryInput(e.target.value)}
                          required
                          style={{flex: 1}}
                        />
                        <button type="submit" className="btn btn-primary" style={{padding: '0 24px', height: '42px', fontSize: '0.75rem'}}>
                          + ADD CATEGORY
                        </button>
                      </form>
                    </div>

                    {/* Categories Registry */}
                    <div className="admin-table-container">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>CATEGORY NAME</th>
                            <th style={{textAlign: 'center'}}>ACTIVE PRODUCTS COUNT</th>
                            <th style={{textAlign: 'right'}}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.filter(cat => cat.toUpperCase() !== 'UNCATEGORIZED').map(cat => (
                            <tr key={cat}>
                              <td style={{fontWeight: '700', letterSpacing: '1px'}}>
                                {editingCategoryName === cat ? (
                                  <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                    <input 
                                      type="text"
                                      className="form-input"
                                      value={editingCategoryInput}
                                      onChange={e => setEditingCategoryInput(e.target.value)}
                                      style={{padding: '4px 8px', height: '32px', fontSize: '0.8rem'}}
                                      required
                                    />
                                    <button 
                                      className="admin-tag-toggle" 
                                      onClick={() => {
                                        const cleanVal = editingCategoryInput.trim().toUpperCase();
                                        if (!cleanVal) return;
                                        if (categories.includes(cleanVal) && cleanVal !== cat) {
                                          alert("This category already exists!");
                                          return;
                                        }
                                        
                                        // Update categories list
                                        const updatedCats = categories.map(c => c === cat ? cleanVal : c);
                                        setCategories(updatedCats);
                                        localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(updatedCats));

                                        // Update all products in this category
                                        const updatedProds = products.map(p => {
                                          if (p.category.toUpperCase() === cat.toUpperCase()) {
                                            const updatedP = { ...p, category: cleanVal };
                                            database.updateProduct(p.id, updatedP); // Sync to DB/LocalStorage
                                            return updatedP;
                                          }
                                          return p;
                                        });
                                        setProducts(updatedProds);

                                        setEditingCategoryName(null);
                                        alert(`Category name successfully updated to "${cleanVal}"!`);
                                      }}
                                      style={{padding: '4px 12px', fontSize: '0.65rem'}}
                                    >
                                      SAVE
                                    </button>
                                    <button 
                                      className="admin-tag-toggle" 
                                      onClick={() => setEditingCategoryName(null)}
                                      style={{padding: '4px 12px', fontSize: '0.65rem', backgroundColor: '#e74c3c'}}
                                    >
                                      CANCEL
                                    </button>
                                  </div>
                                ) : (
                                  cat
                                )}
                              </td>
                              <td style={{textAlign: 'center', fontWeight: 'bold', color: 'var(--accent-gold)'}}>
                                {products.filter(p => p.category.toUpperCase() === cat.toUpperCase()).length} products
                              </td>
                              <td style={{textAlign: 'right'}}>
                                <div style={{display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                                  {editingCategoryName !== cat && (
                                    <>
                                      <button 
                                        className="admin-icon-btn edit"
                                        onClick={() => {
                                          setEditingCategoryName(cat);
                                          setEditingCategoryInput(cat);
                                        }}
                                        style={{fontSize: '0.65rem', textDecoration: 'underline', color: 'var(--accent-gold)'}}
                                      >
                                        [EDIT]
                                      </button>
                                      <button 
                                        className="admin-icon-btn delete"
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to permanently delete the category "${cat}"? Products in this category will be reassigned to "UNCATEGORIZED".`)) {
                                            // Update categories list
                                            const updatedCats = categories.filter(c => c !== cat);
                                            setCategories(updatedCats);
                                            localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(updatedCats));

                                            // Reassign products to UNCATEGORIZED
                                            const updatedProds = products.map(p => {
                                              if (p.category.toUpperCase() === cat.toUpperCase()) {
                                                const updatedP = { ...p, category: 'UNCATEGORIZED' };
                                                database.updateProduct(p.id, updatedP); // Sync to DB/LocalStorage
                                                return updatedP;
                                              }
                                              return p;
                                            });
                                            setProducts(updatedProds);
                                            
                                            // Also make sure UNCATEGORIZED is in categories state if not already
                                            if (!updatedCats.includes('UNCATEGORIZED')) {
                                              const newCats = [...updatedCats, 'UNCATEGORIZED'];
                                              setCategories(newCats);
                                              localStorage.setItem('elixyr_product_categories_v2', JSON.stringify(newCats));
                                            }

                                            alert(`Category "${cat}" successfully deleted!`);
                                          }
                                        }}
                                        style={{fontSize: '0.65rem', textDecoration: 'underline', color: '#e74c3c'}}
                                      >
                                        [DELETE]
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dashboard Tab 6: STATUSES */}
                {adminActiveTab === 'statuses' && (
                  <div>
                    {/* Add Status Panel */}
                    <div className="admin-form-container" style={{marginBottom: '24px', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'}}>
                      <h3 className="admin-form-title" style={{margin: 0, marginBottom: '12px'}}>+ Register New Fulfillment Status</h3>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const cleanLabel = newStatusLabel.trim();
                        if (!cleanLabel) return;
                        
                        // Generate a key (e.g. "Ready for Dispatch" -> "ready_for_dispatch")
                        const newKey = cleanLabel.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                        if (!newKey) {
                          alert("Invalid status label. Please use alphanumeric characters.");
                          return;
                        }
                        
                        if (fulfillmentStatuses.some(s => s.key === newKey)) {
                          alert(`A status with key "${newKey}" or similar label already exists!`);
                          return;
                        }
                        
                        const updated = [...fulfillmentStatuses, { key: newKey, label: cleanLabel }];
                        setFulfillmentStatuses(updated);
                        localStorage.setItem('elixyr_fulfillment_statuses_v2', JSON.stringify(updated));
                        setNewStatusLabel('');
                        alert(`Status "${cleanLabel}" successfully registered!`);
                      }} style={{display: 'flex', gap: '12px'}}>
                        <input 
                          type="text"
                          className="form-input"
                          placeholder="e.g. Shipped to Courier"
                          value={newStatusLabel}
                          onChange={e => setNewStatusLabel(e.target.value)}
                          required
                          style={{flex: 1}}
                        />
                        <button type="submit" className="btn btn-primary" style={{padding: '0 24px', height: '42px', fontSize: '0.75rem'}}>
                          + ADD STATUS
                        </button>
                      </form>
                    </div>

                    {/* Statuses Registry */}
                    <div className="admin-table-container">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>STATUS KEY</th>
                            <th>DISPLAY LABEL</th>
                            <th style={{textAlign: 'center'}}>AFFECTED ORDERS COUNT</th>
                            <th style={{textAlign: 'right'}}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fulfillmentStatuses.map(status => (
                            <tr key={status.key}>
                              <td style={{fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-tertiary)'}}>
                                {status.key}
                              </td>
                              <td style={{fontWeight: '700', letterSpacing: '1px'}}>
                                {editingStatusKey === status.key ? (
                                  <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                    <input 
                                      type="text"
                                      className="form-input"
                                      value={editingStatusLabel}
                                      onChange={e => setEditingStatusLabel(e.target.value)}
                                      style={{padding: '4px 8px', height: '32px', fontSize: '0.8rem'}}
                                      required
                                    />
                                    <button 
                                      className="admin-tag-toggle" 
                                      onClick={() => {
                                        const cleanLabel = editingStatusLabel.trim();
                                        if (!cleanLabel) return;
                                        
                                        // Update label in list
                                        const updated = fulfillmentStatuses.map(s => s.key === status.key ? { ...s, label: cleanLabel } : s);
                                        setFulfillmentStatuses(updated);
                                        localStorage.setItem('elixyr_fulfillment_statuses_v2', JSON.stringify(updated));
                                        setEditingStatusKey(null);
                                        alert(`Status label updated to "${cleanLabel}"!`);
                                      }}
                                      style={{padding: '4px 12px', fontSize: '0.65rem'}}
                                    >
                                      SAVE
                                    </button>
                                    <button 
                                      className="admin-tag-toggle" 
                                      onClick={() => setEditingStatusKey(null)}
                                      style={{padding: '4px 12px', fontSize: '0.65rem', backgroundColor: '#e74c3c'}}
                                    >
                                      CANCEL
                                    </button>
                                  </div>
                                ) : (
                                  status.label
                                )}
                              </td>
                              <td style={{textAlign: 'center', fontWeight: 'bold', color: 'var(--accent-gold)'}}>
                                {orders.filter(o => o.status === status.key).length} orders
                              </td>
                              <td style={{textAlign: 'right'}}>
                                <div style={{display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                                  {editingStatusKey !== status.key && (
                                    <>
                                      <button 
                                        className="admin-icon-btn edit"
                                        onClick={() => {
                                          setEditingStatusKey(status.key);
                                          setEditingStatusLabel(status.label);
                                        }}
                                        style={{fontSize: '0.65rem', textDecoration: 'underline', color: 'var(--accent-gold)'}}
                                      >
                                        [EDIT]
                                      </button>
                                      {status.key !== 'pending' ? (
                                        <button 
                                          className="admin-icon-btn delete"
                                          onClick={() => {
                                            if (confirm(`Are you sure you want to permanently delete the status "${status.label}"? Orders assigned to this status will be automatically reassigned to "Received" (pending).`)) {
                                              // Reassign affected orders
                                              const updatedOrders = orders.map(o => {
                                                if (o.status === status.key) {
                                                  const updatedO = { ...o, status: 'pending' };
                                                  database.updateOrder(o.id, updatedO);
                                                  return updatedO;
                                                }
                                                return o;
                                              });
                                              setOrders(updatedOrders);

                                              // Filter out deleted status
                                              const updatedStatuses = fulfillmentStatuses.filter(s => s.key !== status.key);
                                              setFulfillmentStatuses(updatedStatuses);
                                              localStorage.setItem('elixyr_fulfillment_statuses_v2', JSON.stringify(updatedStatuses));
                                              alert(`Status "${status.label}" successfully deleted!`);
                                            }
                                          }}
                                          style={{fontSize: '0.65rem', textDecoration: 'underline', color: '#e74c3c'}}
                                        >
                                          [DELETE]
                                        </button>
                                      ) : (
                                        <span style={{fontSize: '0.65rem', color: 'var(--text-tertiary)', fontStyle: 'italic'}}>Protected</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dashboard Tab 7: VIP CRM */}
                {adminActiveTab === 'crm' && (
                  <div>
                    {/* VIP CRM Stats Cards */}
                    <div className="admin-stats-row">
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Unique Clients</div>
                        <div className="stat-card-value">
                          {new Set(orders.map(o => `${o.client_name.toLowerCase().trim()}_${sanitizeUAEPhone(o.phone).replace(/\+/g, '')}`)).size}
                        </div>
                        <div className="stat-card-note" style={{color: 'var(--accent-gold)'}}>Active luxury network</div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Platinum VIP Directory</div>
                        <div className="stat-card-value">
                          {compileClientProfiles().filter(c => c.totalSpent >= 1000).length}
                        </div>
                        <div className="stat-card-note" style={{color: '#2ecc71'}}>LTV Spent &gt;= 1,000 AED</div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Repeat Customers</div>
                        <div className="stat-card-value">
                          {compileClientProfiles().filter(c => c.ordersCount > 1).length}
                        </div>
                        <div className="stat-card-note" style={{color: '#3498db'}}>High loyalty projection</div>
                      </div>
                      <div className="admin-stat-card">
                        <div className="stat-card-label">Average Client LTV</div>
                        <div className="stat-card-value">
                          {(() => {
                            const profiles = compileClientProfiles();
                            if (profiles.length === 0) return '0 AED';
                            const sum = profiles.reduce((acc, curr) => acc + curr.totalSpent, 0);
                            return `${Math.round(sum / profiles.length)} AED`;
                          })()}
                        </div>
                        <div className="stat-card-note">Client lifetime spend</div>
                      </div>
                    </div>

                    {/* Filter & Search Registry */}
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px'}}>
                      <div className="form-group" style={{margin: 0, flex: 1, maxWidth: '400px'}}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="🔍 Search VIP name, email, or WhatsApp..."
                          value={crmSearchQuery}
                          onChange={e => setCrmSearchQuery(e.target.value)}
                          style={{fontSize: '0.8rem', padding: '10px 16px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', border: '1px solid rgba(255, 255, 255, 0.05)'}}
                        />
                      </div>
                      <span style={{fontSize: '0.7rem', color: 'var(--text-tertiary)'}}>
                        Compiled instantly from {orders.length} transaction records
                      </span>
                    </div>

                    {/* Clients Table Registry */}
                    <div className="admin-table-box">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>VIP Client Details</th>
                            <th>Membership Tier</th>
                            <th>Fulfillment Orders</th>
                            <th>Total Lifetime Spend</th>
                            <th>Preferred Fragrance Family</th>
                            <th>Private VIP Tags</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const filtered = compileClientProfiles().filter(c => {
                              const q = crmSearchQuery.toLowerCase().trim();
                              return c.name.toLowerCase().includes(q) ||
                                     c.phone.toLowerCase().includes(q) ||
                                     c.email.toLowerCase().includes(q) ||
                                     c.vipTags.some(t => t.toLowerCase().includes(q)) ||
                                     c.membership.toLowerCase().includes(q);
                            });

                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan="7" style={{textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)'}}>
                                    — No client records match your search criteria —
                                  </td>
                                </tr>
                              );
                            }

                            return filtered.map(c => (
                              <tr key={c.id}>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{fontWeight: '700', color: 'var(--text-primary)'}}>{c.name}</div>
                                  <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px'}}>WhatsApp: {c.phone}</div>
                                  <div style={{fontSize: '0.65rem', color: 'var(--text-tertiary)'}}>{c.email}</div>
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <span className={`admin-status-pill ${
                                    c.membership.includes('PLATINUM') ? 'status-instock' :
                                    c.membership.includes('GOLD') ? 'status-lowstock' : 'status-nostock'
                                  }`} style={{fontSize: '0.6rem', fontWeight: '700', padding: '2px 6px'}}>
                                    {c.membership.split(' ')[0]} GUEST
                                  </span>
                                </td>
                                <td style={{verticalAlign: 'top', fontWeight: '600'}}>
                                  🛍️ {c.ordersCount} order(s)
                                </td>
                                <td style={{verticalAlign: 'top', fontWeight: '700', color: 'var(--accent-gold)'}}>
                                  {c.totalSpent.toLocaleString()} AED
                                </td>
                                <td style={{verticalAlign: 'top', textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--text-secondary)'}}>
                                  {c.favoriteCategory}
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '180px'}}>
                                    {c.vipTags.length === 0 ? (
                                      <span style={{fontSize: '0.65rem', color: 'var(--text-tertiary)', fontStyle: 'italic'}}>No tags added</span>
                                    ) : (
                                      c.vipTags.map((t, idx) => (
                                        <span key={idx} style={{
                                          fontSize: '0.55rem',
                                          fontWeight: '700',
                                          backgroundColor: 'rgba(218, 165, 32, 0.08)',
                                          border: '1px solid rgba(218, 165, 32, 0.15)',
                                          color: 'var(--accent-gold)',
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          textTransform: 'uppercase'
                                        }}>
                                          {t}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </td>
                                <td style={{verticalAlign: 'top'}}>
                                  <button
                                    className="admin-tag-toggle"
                                    onClick={() => {
                                      setActiveCrmClient(c);
                                      setNewVipTag('');
                                    }}
                                    style={{padding: '4px 10px', fontSize: '0.65rem'}}
                                  >
                                    [OPEN PROFILE]
                                  </button>
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </main>

            </div>
          )}

        </div>
      )}

      {/* SLIDING INTERACTIVE SHOPPING CART DRAWER */}
      {isCartOpen && <div className="cart-drawer-backdrop" onClick={() => setIsCartOpen(false)}></div>}
      <div className={`cart-drawer ${isCartOpen ? 'open' : ''}`}>
        <div className="cart-drawer-header">
          <h3>Shopping Cart</h3>
          <button className="cart-drawer-close" onClick={() => setIsCartOpen(false)}>×</button>
        </div>

        <div className="cart-items-box custom-scroll">
          {cart.length === 0 ? (
            <div className="cart-empty-text">Your luxury box is empty.</div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="cart-item-card">
                <img src={item.images[0]} alt={item.name} className="cart-item-img" />
                <div className="cart-item-details">
                  <div>
                    <h4 className="cart-item-name">{item.name}</h4>
                    <span className="cart-item-meta">{item.scent_family || 'Discovery Set'}</span>
                  </div>
                  <div className="cart-item-row">
                    <div className="cart-qty-ctrl">
                      <button onClick={() => updateCartQty(item.id, -1)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => updateCartQty(item.id, 1)}>+</button>
                    </div>
                    <span className="cart-price-tag">{item.price * item.qty} AED</span>
                    <button 
                      onClick={() => removeFromCart(item.id)} 
                      style={{fontSize: '0.65rem', textDecoration: 'underline', color: '#e74c3c'}}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-subtotal-row">
              <span>SUBTOTAL:</span>
              <span className="cart-subtotal-val">{getSubtotal()} AED</span>
            </div>
            <button 
              className="btn-cart-checkout"
              onClick={() => { setIsCartOpen(false); document.getElementById('secure-checkout').scrollIntoView({ behavior: 'smooth' }); }}
            >
              PROCEED TO SECURE CHECKOUT
            </button>
          </div>
        )}
      </div>

      {/* EDITORIAL BLOG LAYER READING MODAL */}
      {selectedBlog && (
        <div className="overlay-container" onClick={() => setSelectedBlog(null)}>
          <div className="blog-reader-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedBlog(null)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category">{selectedBlog.category}</span>
              <h2 className="font-serif">{selectedBlog.title}</h2>
              <p className="blog-body-text">{selectedBlog.content}</p>
            </div>
          </div>
        </div>
      )}

      {/* --- DYNAMIC INTERACTIVE VIRTUAL SCENT SOMMELIER QUIZ MODAL OVERLAY --- */}
      {isQuizOpen && (
        <div className="overlay-container" onClick={() => setIsQuizOpen(false)}>
          <div className="blog-reader-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
            <button className="close-btn" onClick={() => setIsQuizOpen(false)}>×</button>
            
            {/* Step 0: Welcome Frame */}
            {quizStep === 0 && (
              <div style={{textAlign: 'center', padding: '10px 0'}}>
                <img 
                  src={sommelierBlotters} 
                  alt="Virtual Scent Sommelier" 
                  className="quiz-welcome-img"
                  style={{borderRadius: '4px', marginBottom: '20px', width: '100%', maxHeight: '240px', objectFit: 'cover'}}
                />
                <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700'}}>VIRTUAL SOMMELIER</span>
                <h2 className="font-serif" style={{fontSize: '2.4rem', marginTop: '8px', marginBottom: '12px'}}>Your Olfactory Consultation</h2>
                <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto var(--space-md)', lineHeight: '1.7', fontStyle: 'italic'}}>
                  "Greetings, fragrance connoisseur. I am your personal Elixyr scent sommelier. Allow me to guide you through a sensory exploration. By sharing your aesthetic preferences and the invisible aura you wish to project, we shall unveil the ultimate signature Elixyr fragrance crafted for your skin."
                </p>
                <button className="btn btn-primary" onClick={() => setQuizStep(1)}>
                  Begin Consultation
                </button>
              </div>
            )}

            {/* Steps 1 to 3 Questionnaire */}
            {quizStep >= 1 && quizStep <= 3 && (
              <div>
                {/* Progress bar line */}
                <div className="quiz-progress-track">
                  <div className="quiz-progress-fill" style={{width: `${(quizStep - 1) * 50}%`}}></div>
                </div>

                <span className="section-category">CONSULTATION STAGE {quizStep} OF 3</span>

                {/* Question 1: Scent Silhouette (Gender) */}
                {quizStep === 1 && (
                  <div className="quiz-steps-wrapper">
                    <h2 className="font-serif" style={{fontSize: '2rem', marginBottom: '8px'}}>How would you describe the olfactory poetry of your presence on the skin?</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '24px'}}>"Tell me, how do you wish to project your presence to the world?"</p>
                    
                    <div className="quiz-choices-grid">
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('silhouette', 'feminine')}>
                        <span className="quiz-choice-title">An Ethereal Floral Whisper</span>
                        <span className="quiz-choice-desc">Velvety Damask rose petals cradled by warm Egyptian jasmine and soft iris powder. Whispers of clean white blooms.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('silhouette', 'shared')}>
                        <span className="quiz-choice-title">An Avant-Garde Unisex Contrast</span>
                        <span className="quiz-choice-desc">A rare shared harmony of ocean-salted ambergris, sea air, creamy Mysore sandalwood, and warm resins.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('silhouette', 'masculine')}>
                        <span className="quiz-choice-title">A Sovereign Spice & Wood Aura</span>
                        <span className="quiz-choice-desc">Prestigious smoked Cambodian agarwood, roasted cocoa pods, and raw Persian saffron. Commands space.</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Question 2: Olfactory Niche (Family) */}
                {quizStep === 2 && (
                  <div className="quiz-steps-wrapper">
                    <h2 className="font-serif" style={{fontSize: '2rem', marginBottom: '8px'}}>Which sensory memory or sanctuary makes your heart beat faster?</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '24px'}}>"Close your eyes and select the notes that speak to your memory."</p>
                    
                    <div className="quiz-choices-grid">
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('niche', 'deep')}>
                        <span className="quiz-choice-title">The Sanctuary of Ancient Majlis</span>
                        <span className="quiz-choice-desc">Rich incense smoke melting over aged wood logs, warm honeyed amber resins, and dry black leather.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('niche', 'powdery')}>
                        <span className="quiz-choice-title">The Comfort of Velvet Cashmere</span>
                        <span className="quiz-choice-desc">Fluffy powdery skin musk, Tuscan iris root concrete, soft morning violets, and sweet bourbon vanilla pods.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('niche', 'vibrant')}>
                        <span className="quiz-choice-title">The Dream of an Orange Orchard</span>
                        <span className="quiz-choice-desc">Calabrian bergamot zest pressed under the midday sun, sparkling neroli blooms, and orange blossom nectar.</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Question 3: Scent Intensity (Sillage) */}
                {quizStep === 3 && (
                  <div className="quiz-steps-wrapper">
                    <h2 className="font-serif" style={{fontSize: '2rem', marginBottom: '8px'}}>How do you wish your fragrance to write its final, lingering story in the room?</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '24px'}}>"How far do you want your signature trail to travel through the air?"</p>
                    
                    <div className="quiz-choices-grid">
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('intensity', 'quiet')}>
                        <span className="quiz-choice-title">An Intimate, Private Secret</span>
                        <span className="quiz-choice-desc">Rests closely against the skin. An exquisite whisper only discovered during the closeness of a warm embrace.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('intensity', 'refined')}>
                        <span className="quiz-choice-title">A Captivating, Trailing Memory</span>
                        <span className="quiz-choice-desc">Leaves a sophisticated, balanced trail in your wake. People look back, quietly intrigued by your memory.</span>
                      </button>
                      <button className="quiz-choice-btn" onClick={() => handleQuizAnswer('intensity', 'sovereign')}>
                        <span className="quiz-choice-title">A Commanding, Imperial Statement</span>
                        <span className="quiz-choice-desc">Vibrant, powerful, and majestic. It fills the room, announcing your entry long before you speak.</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: The Revelation Match */}
            {quizStep === 4 && matchedProduct && (
              <div style={{textAlign: 'center', padding: '10px 0'}}>
                <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700'}}>THE CONCIERGE RECOMMENDATION</span>
                <h2 className="font-serif" style={{fontSize: '2.6rem', marginTop: '6px', marginBottom: '8px'}}>Your Olfactory Signature</h2>
                
                <div className="quiz-match-card" style={{display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', padding: '24px', borderRadius: '4px', textAlign: 'left', marginTop: '20px', border: '1px solid var(--border-primary)'}}>
                  <div className="bottle-img-wrapper" style={{aspectRatio: '1', borderRadius: '4px', overflow: 'hidden'}}>
                    <img src={matchedProduct.images[0]} alt={matchedProduct.name} className="quiz-match-img" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  </div>
                  <div>
                    <span className="product-scent-family" style={{fontSize: '0.65rem', color: 'var(--accent-gold)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700'}}>{matchedProduct.scent_family}</span>
                    <h3 className="font-serif" style={{fontSize: '1.8rem', marginTop: '4px', marginBottom: '8px', color: 'var(--text-primary)'}}>{matchedProduct.name}</h3>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px', fontStyle: 'italic', borderLeft: '2px solid var(--accent-gold)', paddingLeft: '12px'}}>
                      "Based on your profile, I highly recommend {matchedProduct.name}. It perfectly aligns with your desire for a {matchedProduct.scent_family.toLowerCase()} presence. Hand-batched with {matchedProduct.key_notes.join(' and ')}, it will bind beautifully with your skin chemistry to create an addictive, unforgettable trail."
                    </p>
                    <p style={{fontSize: '0.8rem', color: 'var(--text-tertiary)'}}>
                      <strong>Key Blends:</strong> {matchedProduct.scent_mixes || 'Rare flower and wood extracts'}
                    </p>
                  </div>
                </div>

                <div style={{display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px'}}>
                  <button 
                    className="btn btn-primary"
                    onClick={() => { addToCart(matchedProduct); setIsQuizOpen(false); }}
                    style={{flex: 1, maxWidth: '280px'}}
                  >
                    ADD TO SLIP — {matchedProduct.price} AED
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => { navigateTo(`/${matchedProduct.slug}`); setIsQuizOpen(false); }}
                    style={{flex: 1, maxWidth: '200px'}}
                  >
                    DISCOVER FULL DETAILS
                  </button>
                </div>

                <button 
                  onClick={resetQuiz} 
                  style={{marginTop: '24px', fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', letterSpacing: '1px', textTransform: 'uppercase'}}
                >
                  ← Restart Olfactory Consultation
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* CREATE MANUAL ORDER DRAWER OVERLAY */}
      {isCreatingOrder && (
        <div className="overlay-container" style={{zIndex: 3000}} onClick={() => setIsCreatingOrder(false)}>
          <div className="blog-reader-modal admin-edit-drawer" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
            <button className="close-btn" onClick={() => setIsCreatingOrder(false)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700'}}>Back-Office System</span>
              <h2 className="font-serif" style={{fontSize: '2rem'}}>Create Manual Order</h2>
              <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px'}}>Create a custom secure order record for WhatsApp or phone booking clients.</p>

              {manualOrderError && (
                <div className="checkout-error-banner" role="alert" style={{
                  color: '#c0392b',
                  fontSize: '0.8rem',
                  marginBottom: '20px',
                  padding: '12px 16px',
                  border: '1px solid rgba(192, 57, 43, 0.2)',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '2px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: '500',
                  letterSpacing: '0.02em',
                  lineHeight: '1.4'
                }}>
                  <span style={{ fontSize: '1rem', color: '#c0392b' }}>⚠️</span>
                  <span>{manualOrderError}</span>
                </div>
              )}

              <form onSubmit={(e) => {
                e.preventDefault();
                
                // Validate phone using new smart sanitizer
                const cleanPhone = sanitizeUAEPhone(manualOrderForm.phone);
                if (!isValidUAEPhone(cleanPhone)) {
                  setManualOrderError("Invalid Phone: Please enter a valid UAE mobile or area number (e.g. +971501234567, 0501234567, or 501234567).");
                  return;
                }

                // Validate email
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (manualOrderForm.email && !emailRegex.test(manualOrderForm.email)) {
                  setManualOrderError("Invalid Email: Please provide a valid email address (e.g., name@example.com).");
                  return;
                }

                // Validate items
                const selectedItems = manualOrderForm.items.filter(item => item.qty > 0);
                if (selectedItems.length === 0) {
                  setManualOrderError("Fragrance Registry empty: Please add at least one fragrance to this manual order.");
                  return;
                }

                setManualOrderError(null);

                // Calculate costs
                const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
                const feeText = manualOrderForm.emirate.match(/\d+/);
                const delivery = feeText ? parseInt(feeText[0]) : 15;
                const total = subtotal + delivery;
                const dateStr = new Date().toISOString().split('T')[0];
                const dynamicId = 'ELX-' + Math.floor(10000 + Math.random() * 90000);

                const payload = {
                  orderNumber: dynamicId,
                  date: dateStr,
                  clientName: manualOrderForm.fullName,
                  phone: cleanPhone,
                  email: manualOrderForm.email,
                  emirate: manualOrderForm.emirate,
                  paymentMethod: manualOrderForm.paymentMethod,
                  items: selectedItems,
                  subtotal,
                  delivery,
                  total
                };

                database.insertOrder(payload).then(savedRecord => {
                  setOrders([savedRecord, ...orders]);
                  setIsCreatingOrder(false);
                  setManualOrderForm({
                    fullName: '',
                    phone: '+971',
                    email: '',
                    emirate: 'Dubai (15 AED)',
                    paymentMethod: 'WhatsApp Order Concierge',
                    items: []
                  });
                  alert(`Manual Order ${savedRecord.order_number} successfully registered!`);
                });
              }} className="admin-modal-form" style={{marginTop: '20px'}}>
                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">CLIENT FULL NAME</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      placeholder="E.g., Hamdan bin Mohammed"
                      value={manualOrderForm.fullName}
                      onChange={e => setManualOrderForm({...manualOrderForm, fullName: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">WHATSAPP PHONE</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      placeholder="E.g., +971501234567"
                      value={manualOrderForm.phone}
                      onChange={e => setManualOrderForm({...manualOrderForm, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">EMAIL ADDRESS</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      placeholder="E.g., name@domain.ae"
                      value={manualOrderForm.email}
                      onChange={e => setManualOrderForm({...manualOrderForm, email: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">DELIVERY EMIRATE</label>
                    <select 
                      className="form-input"
                      value={manualOrderForm.emirate}
                      onChange={e => setManualOrderForm({...manualOrderForm, emirate: e.target.value})}
                    >
                      <option value="Dubai (15 AED)">Dubai (15 AED)</option>
                      <option value="Abu Dhabi (20 AED)">Abu Dhabi (20 AED)</option>
                      <option value="Sharjah (15 AED)">Sharjah (15 AED)</option>
                      <option value="Ajman (20 AED)">Ajman (20 AED)</option>
                      <option value="Ras Al Khaimah (25 AED)">Ras Al Khaimah (25 AED)</option>
                      <option value="Fujairah (25 AED)">Fujairah (25 AED)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">PRIMARY PAYMENT METHOD</label>
                  <select 
                    className="form-input"
                    value={manualOrderForm.paymentMethod}
                    onChange={e => setManualOrderForm({...manualOrderForm, paymentMethod: e.target.value})}
                  >
                    <option value="WhatsApp Order Concierge">WhatsApp Order Concierge</option>
                    <option value="Cash on Delivery (Coming Soon)">Cash on Delivery (Coming Soon)</option>
                    <option value="Digital Payment (Coming Soon)">Digital Payment (Coming Soon)</option>
                  </select>
                </div>

                <div className="form-group" style={{marginTop: '16px'}}>
                  <label className="form-label" style={{marginBottom: '8px'}}>SELECT BOUTIQUE ITEMS & QUANTITIES</label>
                  <div style={{maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '2px', padding: '8px', background: 'rgba(255,255,255,0.01)'}}>
                    {products.map(p => {
                      const matchItem = manualOrderForm.items.find(item => item.id === p.id);
                      const qty = matchItem ? matchItem.qty : 0;
                      return (
                        <div key={p.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                          <div style={{fontSize: '0.8rem', color: 'var(--text-primary)'}}>
                            <span style={{fontWeight: '600'}}>{p.name}</span> <span style={{fontSize: '0.65rem', color: 'var(--accent-gold)'}}>({p.price} AED)</span>
                          </div>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <button 
                              type="button" 
                              className="admin-tag-toggle" 
                              style={{padding: '2px 8px'}}
                              onClick={() => {
                                let updatedItems = [...manualOrderForm.items];
                                const idx = updatedItems.findIndex(item => item.id === p.id);
                                if (idx !== -1) {
                                  if (updatedItems[idx].qty > 1) {
                                    updatedItems[idx].qty -= 1;
                                  } else {
                                    updatedItems.splice(idx, 1);
                                  }
                                }
                                setManualOrderForm({...manualOrderForm, items: updatedItems});
                              }}
                            >
                              -
                            </button>
                            <span style={{fontSize: '0.85rem', fontWeight: 'bold', width: '20px', textAlign: 'center', color: 'var(--text-primary)'}}>{qty}</span>
                            <button 
                              type="button" 
                              className="admin-tag-toggle" 
                              style={{padding: '2px 8px'}}
                              onClick={() => {
                                let updatedItems = [...manualOrderForm.items];
                                const idx = updatedItems.findIndex(item => item.id === p.id);
                                if (idx !== -1) {
                                  updatedItems[idx].qty += 1;
                                } else {
                                  updatedItems.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
                                }
                                setManualOrderForm({...manualOrderForm, items: updatedItems});
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{display: 'flex', gap: '16px', marginTop: '20px'}}>
                  <button type="submit" className="btn-submit" style={{marginTop: '0', flex: '1'}}>CREATE ORDER</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsCreatingOrder(false)} style={{padding: '0 24px'}}>CANCEL</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ORDER DRAWER OVERLAY */}
      {editingOrder && (
        <div className="overlay-container" onClick={() => setEditingOrder(null)}>
          <div className="blog-reader-modal admin-edit-drawer" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
            <button className="close-btn" onClick={() => setEditingOrder(null)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category">Bespoke Customer Order Update Gate</span>
              <h2 className="font-serif" style={{fontSize: '2rem'}}>Edit Customer Order</h2>
              
              <form onSubmit={handleSaveOrderEdits} className="admin-modal-form" style={{marginTop: '20px'}}>
                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">CUSTOMER NAME</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingOrder.client_name || editingOrder.clientName || ''}
                      onChange={e => setEditingOrder({...editingOrder, client_name: e.target.value, clientName: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">WHATSAPP PHONE</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingOrder.phone || ''}
                      onChange={e => setEditingOrder({...editingOrder, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">EMAIL ADDRESS</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      required 
                      value={editingOrder.email || ''}
                      onChange={e => setEditingOrder({...editingOrder, email: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">DELIVERY EMIRATE</label>
                    <select 
                      className="form-input"
                      value={editingOrder.emirate}
                      onChange={e => setEditingOrder({...editingOrder, emirate: e.target.value})}
                    >
                      <option>Dubai (15 AED)</option>
                      <option>Abu Dhabi (20 AED)</option>
                      <option>Sharjah (15 AED)</option>
                      <option>Ajman (20 AED)</option>
                      <option>Ras Al Khaimah (25 AED)</option>
                      <option>Fujairah (25 AED)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">PAYMENT METHOD</label>
                    <select 
                      className="form-input"
                      value={editingOrder.payment_method || editingOrder.paymentMethod || 'WhatsApp Order Concierge'}
                      onChange={e => setEditingOrder({...editingOrder, payment_method: e.target.value, paymentMethod: e.target.value})}
                    >
                      <option value="WhatsApp Order Concierge">WhatsApp Order Concierge</option>
                      <option value="Digital Payment">Digital Payment</option>
                      <option value="Cash on Delivery">Cash on Delivery</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ORDER STATUS</label>
                    <select 
                      className="form-input"
                      value={editingOrder.status || 'pending'}
                      onChange={e => setEditingOrder({...editingOrder, status: e.target.value})}
                    >
                      {fulfillmentStatuses.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">COURIER TRACKING AWB #</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. AWB-XXXXX" 
                      value={editingOrder.tracking_number || ''}
                      onChange={e => setEditingOrder({...editingOrder, tracking_number: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">COURIER TRACKING LINK</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. https://courier.com/track" 
                      value={editingOrder.tracking_link || ''}
                      onChange={e => setEditingOrder({...editingOrder, tracking_link: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{display: 'flex', gap: '16px', marginTop: '16px'}}>
                  <button type="submit" className="btn-submit" style={{marginTop: '0', flex: '1'}}>SAVE ORDER DETAILS</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingOrder(null)} style={{padding: '0 24px'}}>CANCEL</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT DRAWER OVERLAY */}
      {editingProduct && (
        <div className="overlay-container" onClick={() => setEditingProduct(null)}>
          <div className="blog-reader-modal admin-edit-drawer" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
            <button className="close-btn" onClick={() => setEditingProduct(null)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category">Bespoke Product Editing Gate</span>
              <h2 className="font-serif" style={{fontSize: '2rem'}}>Edit Fragrance SKU</h2>
              
              <form onSubmit={handleSaveProductEdits} className="admin-modal-form" style={{marginTop: '20px'}}>
                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">PRODUCT NAME</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingProduct.name}
                      onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                      <label className="form-label" style={{marginBottom: 0}}>CATEGORY</label>
                      <button 
                        type="button" 
                        className="admin-tag-toggle" 
                        onClick={() => setEditingProduct({
                          ...editingProduct, 
                          isCustomCategory: !editingProduct.isCustomCategory, 
                          customCategory: editingProduct.isCustomCategory ? '' : (editingProduct.category || '')
                        })}
                      >
                        {editingProduct.isCustomCategory ? '← Use Preset' : '+ New Category'}
                      </button>
                    </div>
                    {editingProduct.isCustomCategory ? (
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="e.g. FLORAL ABSOLUTES"
                        value={editingProduct.customCategory || ''}
                        onChange={e => setEditingProduct({...editingProduct, customCategory: e.target.value})}
                      />
                    ) : (
                      <select 
                        className="form-input"
                        value={editingProduct.category}
                        onChange={e => setEditingProduct({...editingProduct, category: e.target.value})}
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">PRICE (AED)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      required 
                      value={editingProduct.price}
                      onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">SCENT FAMILY</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingProduct.scent_family}
                      onChange={e => setEditingProduct({...editingProduct, scent_family: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">SILLAGE PROJECTION (0 - 100%)</label>
                    <input 
                      type="number" 
                      min="0" max="100"
                      className="form-input" 
                      required 
                      value={editingProduct.sillage}
                      onChange={e => setEditingProduct({...editingProduct, sillage: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">LONGEVITY HOURS (0 - 100%)</label>
                    <input 
                      type="number" 
                      min="0" max="100"
                      className="form-input" 
                      required 
                      value={editingProduct.longevity}
                      onChange={e => setEditingProduct({...editingProduct, longevity: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">GENDER PROFILE (0-100% MASCULINE)</label>
                    <input 
                      type="number" 
                      min="0" max="100"
                      className="form-input" 
                      required 
                      value={editingProduct.gender}
                      onChange={e => setEditingProduct({...editingProduct, gender: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">BATCH DETAILS</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingProduct.batch_details || ''}
                      onChange={e => setEditingProduct({...editingProduct, batch_details: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">EXCLUSIVITY/SCARCITY TAG</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={editingProduct.scarcity_note || ''}
                      onChange={e => setEditingProduct({...editingProduct, scarcity_note: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">KEY NOTES LIST (COMMA SEPARATED)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={Array.isArray(editingProduct.key_notes) ? editingProduct.key_notes.join(', ') : editingProduct.key_notes || ''}
                    onChange={e => setEditingProduct({...editingProduct, key_notes: e.target.value.split(',').map(n => n.trim())})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">SCENT BLENDING MIX FORMULA</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={editingProduct.scent_mixes || ''}
                    onChange={e => setEditingProduct({...editingProduct, scent_mixes: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{marginBottom: '8px'}}>PRODUCT IMAGES</label>
                  <div className="admin-file-upload-zone">
                    <span className="admin-upload-icon">+</span>
                    <span className="admin-upload-text">Upload Fragrance Images</span>
                    <span className="admin-upload-subtext">Drag & drop files or click to browse (Max 800px compressed)</span>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={async (e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const filesArray = Array.from(e.target.files);
                          try {
                            const processedUrls = await Promise.all(
                              filesArray.map(file => compressAndProcessImage(file))
                            );
                            const currentImgs = Array.isArray(editingProduct.images) ? editingProduct.images : [editingProduct.images].filter(Boolean);
                            setEditingProduct(prev => ({
                              ...prev,
                              images: [...currentImgs, ...processedUrls]
                            }));
                          } catch (error) {
                            console.error("Error processing images:", error);
                            alert("Could not process some images. Please try another file.");
                          }
                        }
                      }} 
                    />
                  </div>

                  {/* Dynamic Warning Indicator */}
                  {(Array.isArray(editingProduct.images) ? editingProduct.images : [editingProduct.images].filter(Boolean)).length > 3 && (
                    <p className="admin-upload-warning">
                      ⚠️ Premium Curation: Three images are recommended for optimal boutique display.
                    </p>
                  )}

                  {/* Image preview thumbnails */}
                  {(Array.isArray(editingProduct.images) ? editingProduct.images : [editingProduct.images].filter(Boolean)).length > 0 && (
                    <div className="admin-img-preview-grid">
                      {(Array.isArray(editingProduct.images) ? editingProduct.images : [editingProduct.images].filter(Boolean)).map((img, idx) => (
                        <div key={idx} className="admin-img-preview-card">
                          <img src={img} alt={`Preview ${idx + 1}`} />
                          <button 
                            type="button" 
                            className="admin-img-preview-delete"
                            onClick={() => {
                              const currentImgs = Array.isArray(editingProduct.images) ? editingProduct.images : [editingProduct.images].filter(Boolean);
                              const updatedImgs = currentImgs.filter((_, i) => i !== idx);
                              setEditingProduct({ ...editingProduct, images: updatedImgs });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">STORY DESCRIPTION</label>
                  <textarea 
                    className="form-input" 
                    style={{minHeight: '120px'}}
                    required 
                    value={editingProduct.description || ''}
                    onChange={e => setEditingProduct({...editingProduct, description: e.target.value})}
                  />
                </div>

                <div style={{display: 'flex', gap: '16px', marginTop: '16px'}}>
                  <button type="submit" className="btn-submit" style={{marginTop: '0', flex: '1'}}>SAVE CHANGES</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingProduct(null)} style={{padding: '0 24px'}}>CANCEL</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Blog Edit Drawer */}
      {editingBlog && (
        <div className="overlay-container" onClick={() => setEditingBlog(null)}>
          <div className="blog-reader-modal admin-edit-drawer" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
            <button className="close-btn" onClick={() => setEditingBlog(null)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category">Editorial Control Gate</span>
              <h2 className="font-serif" style={{fontSize: '2rem'}}>Edit Journal Article</h2>

              <form onSubmit={handleSaveBlogEdits} className="admin-modal-form" style={{marginTop: '20px'}}>
                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">ARTICLE TITLE</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={editingBlog.title}
                      onChange={e => setEditingBlog({...editingBlog, title: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CATEGORY</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingBlog.category}
                      onChange={e => setEditingBlog({...editingBlog, category: e.target.value})}
                      placeholder="e.g. BUYING GUIDE"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">PREVIEW EXCERPT</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={editingBlog.excerpt || ''}
                    onChange={e => setEditingBlog({...editingBlog, excerpt: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">ARTICLE BODY CONTENT</label>
                  <textarea
                    className="form-input"
                    style={{minHeight: '160px'}}
                    required
                    value={editingBlog.content || ''}
                    onChange={e => setEditingBlog({...editingBlog, content: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{marginBottom: '8px'}}>COVER IMAGE</label>
                  <div className="admin-file-upload-zone" style={{padding: '16px'}}>
                    <span className="admin-upload-icon">+</span>
                    <span className="admin-upload-text">Upload Cover Image</span>
                    <span className="admin-upload-subtext">Click to choose main editorial photo</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          try {
                            const processedUrl = await compressAndProcessImage(e.target.files[0]);
                            setEditingBlog(prev => ({
                              ...prev,
                              image_url: processedUrl
                            }));
                          } catch (error) {
                            console.error("Error processing image:", error);
                            alert("Could not process the cover image. Please try another file.");
                          }
                        }
                      }} 
                    />
                  </div>
                  {editingBlog.image_url && (
                    <div className="admin-img-preview-grid">
                      <div className="admin-img-preview-card">
                        <img src={editingBlog.image_url} alt="Cover Preview" />
                        <button 
                          type="button" 
                          className="admin-img-preview-delete"
                          onClick={() => setEditingBlog({ ...editingBlog, image_url: '' })}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{marginBottom: '8px'}}>GALLERY/EXTRA IMAGES</label>
                  <div className="admin-file-upload-zone" style={{padding: '16px'}}>
                    <span className="admin-upload-icon">+</span>
                    <span className="admin-upload-text">Upload Gallery Photos</span>
                    <span className="admin-upload-subtext">Drag & drop files or click to browse</span>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={async (e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const filesArray = Array.from(e.target.files);
                          try {
                            const processedUrls = await Promise.all(
                              filesArray.map(file => compressAndProcessImage(file))
                            );
                            setEditingBlog(prev => ({
                              ...prev,
                              extra_images: [...(prev.extra_images || []), ...processedUrls]
                            }));
                          } catch (error) {
                            console.error("Error processing gallery images:", error);
                            alert("Could not process some gallery images. Please try another file.");
                          }
                        }
                      }} 
                    />
                  </div>

                  {/* Dynamic Warning Indicator */}
                  {((editingBlog.image_url ? 1 : 0) + (editingBlog.extra_images || []).length) > 1 && (
                    <p className="admin-upload-warning">
                      ⚠️ Editorial Layout: One cover image is recommended for pristine lifestyle guides.
                    </p>
                  )}

                  {/* Extra Images Preview */}
                  {(editingBlog.extra_images || []).length > 0 && (
                    <div className="admin-img-preview-grid">
                      {(editingBlog.extra_images || []).map((img, idx) => (
                        <div key={idx} className="admin-img-preview-card">
                          <img src={img} alt={`Gallery Preview ${idx + 1}`} />
                          <button 
                            type="button" 
                            className="admin-img-preview-delete"
                            onClick={() => {
                              const updatedImgs = editingBlog.extra_images.filter((_, i) => i !== idx);
                              setEditingBlog({ ...editingBlog, extra_images: updatedImgs });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{display: 'flex', gap: '16px', marginTop: '16px'}}>
                  <button type="submit" className="btn-submit" style={{marginTop: '0', flex: '1'}}>SAVE ARTICLE</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingBlog(null)} style={{padding: '0 24px'}}>CANCEL</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* VIP CLIENT CRM DETAIL DRAWER */}
      {activeCrmClient && (
        <div className="overlay-container" onClick={() => setActiveCrmClient(null)}>
          <div className="blog-reader-modal admin-edit-drawer" onClick={e => e.stopPropagation()} style={{maxWidth: '750px'}}>
            <button className="close-btn" onClick={() => setActiveCrmClient(null)}>×</button>
            <div className="blog-reader-content">
              <span className="section-category" style={{color: 'var(--accent-gold)', fontWeight: '700'}}>VIP CLIENT PROFILE</span>
              <h2 className="font-serif" style={{fontSize: '2.2rem', marginBottom: '4px'}}>{activeCrmClient.name}</h2>
              <span className={`admin-status-pill ${
                activeCrmClient.membership.includes('PLATINUM') ? 'status-instock' :
                activeCrmClient.membership.includes('GOLD') ? 'status-lowstock' : 'status-nostock'
              }`} style={{fontSize: '0.65rem', fontWeight: '700', padding: '3px 8px', letterSpacing: '1px'}}>
                {activeCrmClient.membership}
              </span>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                marginTop: '24px',
                padding: '16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px'
              }}>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>WhatsApp Contact</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px'}}>
                    <a href={`https://wa.me/${activeCrmClient.phone.replace(/\+/g, '')}`} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-gold)', textDecoration: 'underline'}}>
                      {activeCrmClient.phone} ↗
                    </a>
                  </div>
                </div>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>Email Address</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px'}}>
                    {activeCrmClient.email || '—'}
                  </div>
                </div>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>Lifetime Orders</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px'}}>
                    🛍️ {activeCrmClient.ordersCount}
                  </div>
                </div>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>Total Spend</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-gold)', marginTop: '4px'}}>
                    {activeCrmClient.totalSpent.toLocaleString()} AED
                  </div>
                </div>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>Fav Scent Family</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px', textTransform: 'uppercase'}}>
                    {activeCrmClient.favoriteCategory}
                  </div>
                </div>
                <div>
                  <div style={{fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>Last Active</div>
                  <div style={{fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px'}}>
                    {activeCrmClient.lastActive ? new Date(activeCrmClient.lastActive).toLocaleDateString('en-AE', {day: 'numeric', month: 'short', year: 'numeric'}) : '—'}
                  </div>
                </div>
              </div>

              {/* Tag Management */}
              <div style={{marginTop: '24px'}}>
                <label className="form-label" style={{fontSize: '0.65rem', marginBottom: '8px'}}>PRIVATE VIP TAGS</label>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px'}}>
                  {activeCrmClient.vipTags.length === 0 ? (
                    <span style={{fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic'}}>No VIP tags assigned. Add tags below to catalog client details (e.g. Scent Lover, Collector, VIP 2026).</span>
                  ) : (
                    activeCrmClient.vipTags.map((tag, idx) => (
                      <span key={idx} style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        backgroundColor: 'rgba(218, 165, 32, 0.08)',
                        border: '1px solid rgba(218, 165, 32, 0.15)',
                        color: 'var(--accent-gold)',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textTransform: 'uppercase'
                      }}>
                        {tag}
                        <button
                          type="button"
                          onClick={() => {
                            const updatedTags = activeCrmClient.vipTags.filter(t => t !== tag);
                            const updatedClient = { ...activeCrmClient, vipTags: updatedTags };
                            setActiveCrmClient(updatedClient);
                            handleSaveCrmMetadata(activeCrmClient.phone, activeCrmClient.staffNotes, updatedTags);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-gold)',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div style={{display: 'flex', gap: '8px', maxWidth: '350px'}}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="E.g., Sweet Lover"
                    value={newVipTag}
                    onChange={e => setNewVipTag(e.target.value)}
                    style={{padding: '8px 12px', fontSize: '0.75rem', borderRadius: '2px'}}
                  />
                  <button
                    type="button"
                    className="admin-tag-toggle"
                    onClick={() => {
                      const trimmed = newVipTag.trim();
                      if (trimmed) {
                        if (activeCrmClient.vipTags.includes(trimmed)) return;
                        const updatedTags = [...activeCrmClient.vipTags, trimmed];
                        const updatedClient = { ...activeCrmClient, vipTags: updatedTags };
                        setActiveCrmClient(updatedClient);
                        setNewVipTag('');
                        handleSaveCrmMetadata(activeCrmClient.phone, activeCrmClient.staffNotes, updatedTags);
                      }
                    }}
                    style={{padding: '0 16px', fontSize: '0.7rem', fontWeight: 'bold'}}
                  >
                    ADD TAG
                  </button>
                </div>
              </div>

              {/* Private Staff Notes */}
              <div style={{marginTop: '24px'}}>
                <label className="form-label" style={{fontSize: '0.65rem', marginBottom: '8px'}}>ATELIER CRM PRIVATE NOTES (ONLY VISIBLE TO STAFF)</label>
                <textarea
                  className="form-input"
                  style={{minHeight: '100px', fontSize: '0.8rem', lineHeight: '1.5', padding: '12px'}}
                  placeholder="Record private customer scent preferences, customized batch numbers requested, special shipping instructions, or luxury details..."
                  value={activeCrmClient.staffNotes}
                  onChange={e => {
                    const notes = e.target.value;
                    const updatedClient = { ...activeCrmClient, staffNotes: notes };
                    setActiveCrmClient(updatedClient);
                    handleSaveCrmMetadata(activeCrmClient.phone, notes, activeCrmClient.vipTags);
                  }}
                />
              </div>

              {/* Transaction / Chronological Order History */}
              <div style={{marginTop: '32px', borderTop: '1px solid var(--border-primary)', paddingTop: '24px'}}>
                <h4 className="font-serif" style={{fontSize: '1.25rem', marginBottom: '12px'}}>Bespoke Transaction History ({activeCrmClient.ordersCount})</h4>
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  {activeCrmClient.ordersList.map((order, idx) => (
                    <div key={idx} style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      padding: '16px'
                    }}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                        <div>
                          <span style={{fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary)'}}>{order.order_number || order.orderNumber}</span>
                          <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px'}}>
                            {new Date(order.created_at || order.date).toLocaleDateString('en-AE', {day: 'numeric', month: 'short', year: 'numeric'})}
                          </span>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <span className={`admin-status-pill status-${order.status || 'pending'}`} style={{fontSize: '0.6rem', fontWeight: '700', padding: '2px 6px'}}>
                            {order.status?.toUpperCase() || 'RECEIVED'}
                          </span>
                          <span style={{fontWeight: '700', color: 'var(--accent-gold)', fontSize: '0.85rem'}}>
                            {(order.total_amount || order.total || 0).toLocaleString()} AED
                          </span>
                        </div>
                      </div>
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.03)',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}>
                        <strong style={{color: 'var(--text-primary)'}}>Items:</strong> {Array.isArray(order.items) ? order.items.map(item => `${item.qty}x ${item.name} (${item.price} AED)`).join(', ') : '—'}
                      </div>
                      {(order.tracking_number || order.trackingNumber) && (
                        <div style={{fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '8px'}}>
                          AWB tracking: <strong>{order.tracking_number || order.trackingNumber}</strong>
                          {(order.tracking_link || order.trackingLink) && <a href={order.tracking_link || order.trackingLink} target="_blank" rel="noopener noreferrer" style={{marginLeft: '8px', color: 'var(--accent-gold)', textDecoration: 'underline'}}>Follow ↗</a>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{marginTop: '32px', display: 'flex', justifyContent: 'flex-end'}}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveCrmClient(null)}
                  style={{padding: '12px 24px'}}
                >
                  DISMISS DRAWER
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 5. BRAND PREMIUM BLACK FOOTER (Client-facing routes only) */}
      {currentRoute !== '/admin-portal' && (
        <footer className="boutique-footer" style={{
          backgroundColor: '#0A0A0A',
          color: '#E5D5B3',
          padding: '60px 0 40px',
          borderTop: '1px solid rgba(197, 168, 128, 0.15)',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.05em',
          marginTop: '60px'
        }}>
          <div className="container" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '40px',
            marginBottom: '40px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <span className="font-serif" style={{ fontSize: '1.8rem', color: '#F5F2EA', letterSpacing: '2px', fontWeight: '300' }}>ELIXYR</span>
              <p style={{ color: 'var(--text-tertiary)', lineHeight: '1.8', fontSize: '0.75rem', margin: 0 }}>
                Curators of rare extraits and majestic oud blends, hand-poured in small batches in Dubai, UAE.
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h5 className="font-serif" style={{ color: '#F5F2EA', fontSize: '0.95rem', fontWeight: '400', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Collections</h5>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', padding: 0, margin: 0 }}>
                <li><button onClick={() => { navigateTo('/'); setTimeout(() => document.getElementById('shop')?.scrollIntoView({behavior:'smooth'}), 100); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, textAlign: 'left' }}>Oud Blends</button></li>
                <li><button onClick={() => { navigateTo('/'); setTimeout(() => document.getElementById('shop')?.scrollIntoView({behavior:'smooth'}), 100); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, textAlign: 'left' }}>Signature Extraits</button></li>
                <li><button onClick={() => { navigateTo('/'); setTimeout(() => document.getElementById('discovery')?.scrollIntoView({behavior:'smooth'}), 100); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, textAlign: 'left' }}>Discovery Sets</button></li>
              </ul>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h5 className="font-serif" style={{ color: '#F5F2EA', fontSize: '0.95rem', fontWeight: '400', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Customer Service</h5>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', padding: 0, margin: 0 }}>
                <li><button onClick={() => navigateTo('/wanna-see-hows-your-order-doing')} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, textAlign: 'left' }}>Track Order</button></li>
                <li><button onClick={() => { setIsQuizOpen(true); resetQuiz(); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, textAlign: 'left' }}>Scent Quiz</button></li>
                <li><a href="https://wa.me/971501234567" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: '0.75rem' }}>WhatsApp Concierge</a></li>
              </ul>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h5 className="font-serif" style={{ color: '#F5F2EA', fontSize: '0.95rem', fontWeight: '400', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Atelier</h5>
              <p style={{ color: 'var(--text-tertiary)', lineHeight: '1.8', fontSize: '0.75rem', margin: 0 }}>
                An independent olfactory workshop dedicated to rare extraits and high-concentration agarwood blends. Online boutique exclusive.
              </p>
            </div>
          </div>
          
          <div className="container" style={{
            borderTop: '1px solid rgba(197, 168, 128, 0.08)',
            paddingTop: '30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '20px',
            color: 'var(--text-tertiary)',
            fontSize: '0.7rem'
          }}>
            <span>© {new Date().getFullYear()} ELIXYR PERFUME BOUTIQUE. ALL RIGHTS RESERVED.</span>
            <div style={{ display: 'flex', gap: '20px' }}>
              <button onClick={() => navigateTo('/privacy')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>Privacy Policy</button>
              <button onClick={() => navigateTo('/terms')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>Terms of Service</button>
            </div>
          </div>
        </footer>
      )}

    </div>
  );
}

export default App;
