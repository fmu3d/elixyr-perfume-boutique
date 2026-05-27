import { createClient } from '@supabase/supabase-js';
import { mockProducts, mockBlogs } from './mockData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Determine if we have valid-looking Supabase configuration
const isConfigured = supabaseUrl && supabaseAnonKey && 
                    !supabaseUrl.includes('your-project-id') && 
                    !supabaseAnonKey.includes('your-anon-key');

export let supabase = null;

if (isConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('⚜️ Elixyr Integration Core: Supabase connected successfully.');
  } catch (error) {
    console.error('⚠️ Elixyr Integration Core: Failed to initialize Supabase. Falling back to local adapter.', error);
  }
}

// =========================================================================
// FAILS-SAFE LOCAL ADAPTER FOR DATABASE & STATE
// This provides identical database method signatures so the app never breaks.
// =========================================================================

// --- 1. Orders Local Storage ---
const getLocalOrders = () => {
  const data = localStorage.getItem('elixyr_orders_v2');
  return data ? JSON.parse(data) : [];
};

const saveLocalOrders = (orders) => {
  localStorage.setItem('elixyr_orders_v2', JSON.stringify(orders));
};

// --- 2. Products Local Storage ---
const getLocalProducts = () => {
  const data = localStorage.getItem('elixyr_products_v2');
  if (data) {
    const parsed = JSON.parse(data);
    if (parsed.length >= mockProducts.length) {
      return parsed;
    }
  }
  // Force seed/upgrade mock products into LocalStorage
  localStorage.setItem('elixyr_products_v2', JSON.stringify(mockProducts));
  return mockProducts;
};

const saveLocalProducts = (products) => {
  localStorage.setItem('elixyr_products_v2', JSON.stringify(products));
};

// --- 3. Blogs Local Storage ---
const getLocalBlogs = () => {
  const data = localStorage.getItem('elixyr_blogs_v2');
  if (data) {
    const parsed = JSON.parse(data);
    if (parsed.length >= mockBlogs.length) {
      return parsed;
    }
  }
  // Force seed/upgrade mock blogs into LocalStorage
  localStorage.setItem('elixyr_blogs_v2', JSON.stringify(mockBlogs));
  return mockBlogs;
};

const saveLocalBlogs = (blogs) => {
  localStorage.setItem('elixyr_blogs_v2', JSON.stringify(blogs));
};

// =========================================================================
// SMART UAE PHONE SANITIZER & VALIDATORS
// =========================================================================
export const sanitizeUAEPhone = (phone) => {
  if (!phone) return '';
  let rawPhone = phone.replace(/[\s\-()+]/g, ''); // strip spaces, dashes, brackets, and plusses
  
  if (rawPhone.startsWith('00971')) {
    return '+' + rawPhone.slice(2);
  } else if (rawPhone.startsWith('971')) {
    return '+' + rawPhone;
  } else if (rawPhone.startsWith('0') && rawPhone.length === 10) {
    return '+971' + rawPhone.slice(1);
  } else if (rawPhone.length === 9) {
    return '+971' + rawPhone;
  }
  // Fallback: trim and clean spacing, prepend plus if they entered it
  return (phone.trim().startsWith('+') ? '' : '+') + phone.replace(/\s+/g, '');
};

export const isValidUAEPhone = (phone) => {
  const sanitized = sanitizeUAEPhone(phone);
  return /^\+971\d{9}$/.test(sanitized);
};

export const database = {
  // Check active cloud state
  isCloudConnected: () => !!supabase,

  // Sync local orders to cloud Supabase if they are missing
  async syncLocalOrders() {
    if (!supabase) {
      console.log('⚜️ Supabase Auto-Sync: Cloud database not connected. Skipping sync.');
      return { success: false, syncedCount: 0, reason: 'No cloud connection' };
    }
    try {
      // 1. Fetch existing orders from Supabase to match by order_number/id
      const { data: cloudOrders, error } = await supabase
        .from('orders')
        .select('id, order_number');
      
      if (error) {
        console.error('⚜️ Supabase Auto-Sync: Failed to fetch cloud order keys for matching.', error);
        return { success: false, syncedCount: 0, error };
      }

      const cloudKeys = new Set();
      cloudOrders.forEach(o => {
        if (o.id) cloudKeys.add(o.id.toString());
        if (o.order_number) cloudKeys.add(o.order_number.toString());
      });

      // 2. Fetch local orders
      const localOrders = getLocalOrders();
      if (!localOrders || localOrders.length === 0) {
        console.log('⚜️ Supabase Auto-Sync: No local fallback orders to sync.');
        return { success: true, syncedCount: 0 };
      }

      // 3. Find orders that are missing in the cloud
      const missingOrders = localOrders.filter(o => {
        const hasId = o.id && cloudKeys.has(o.id.toString());
        const hasNumber = o.order_number && cloudKeys.has(o.order_number.toString());
        return !hasId && !hasNumber;
      });

      if (missingOrders.length === 0) {
        console.log('⚜️ Supabase Auto-Sync: All local orders are already in the cloud.');
        return { success: true, syncedCount: 0 };
      }

      console.log(`⚜️ Supabase Auto-Sync: Found ${missingOrders.length} local fallback order(s) missing in cloud. Syncing...`);
      
      let syncSuccessCount = 0;
      for (const order of missingOrders) {
        // Construct standard record to match Supabase schema
        const dbRecord = {
          id: order.id,
          order_number: order.order_number,
          client_name: order.client_name,
          email: order.email || '',
          phone: order.phone,
          emirate: order.emirate,
          payment_method: order.payment_method,
          items: order.items,
          subtotal: order.subtotal,
          delivery_fee: order.delivery_fee,
          total_amount: order.total_amount,
          status: order.status || 'pending',
          tracking_number: order.tracking_number || null,
          tracking_link: order.tracking_link || null,
          created_at: order.created_at || new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('orders')
          .insert([dbRecord]);

        if (insertError) {
          console.error(`⚜️ Supabase Auto-Sync: Failed to sync order ${order.order_number || order.id}`, insertError);
        } else {
          console.log(`⚜️ Supabase Auto-Sync: Successfully uploaded order ${order.order_number || order.id} to cloud.`);
          syncSuccessCount++;
        }
      }

      return { success: true, syncedCount: syncSuccessCount };
    } catch (err) {
      console.error('⚜️ Supabase Auto-Sync: Critical error during local orders sync.', err);
      return { success: false, syncedCount: 0, error: err };
    }
  },

  // =========================================================================
  // ORDERS CRUD METHODS
  // =========================================================================

  // Fetch all orders
  async getOrders() {
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error) return data;
      console.warn('Supabase read failed, trying LocalStorage fallback.', error);
    }
    return getLocalOrders();
  },

  // Save new order
  async insertOrder(orderPayload) {
    const newRecord = {
      id: orderPayload.id || `order-${Date.now()}`,
      order_number: orderPayload.orderNumber || orderPayload.order_number,
      client_name: orderPayload.clientName || orderPayload.client_name,
      email: orderPayload.email || '',
      phone: orderPayload.phone,
      emirate: orderPayload.emirate,
      payment_method: orderPayload.paymentMethod || orderPayload.payment_method,
      items: orderPayload.items,
      subtotal: orderPayload.subtotal,
      delivery_fee: orderPayload.delivery || orderPayload.delivery_fee,
      total_amount: orderPayload.total || orderPayload.total_amount,
      status: orderPayload.status || 'pending',
      tracking_number: orderPayload.tracking_number || null,
      tracking_link: orderPayload.tracking_link || null,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .insert([newRecord])
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase insert failed, logging to local storage instead.', error);
    }

    const local = getLocalOrders();
    local.unshift(newRecord);
    saveLocalOrders(local);
    return newRecord;
  },

  // Update order status/tracking parameters
  async updateOrder(id, updates) {
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.tracking_number !== undefined) dbUpdates.tracking_number = updates.tracking_number;
    if (updates.tracking_link !== undefined) dbUpdates.tracking_link = updates.tracking_link;
    
    // Map camelCase and snake_case properties for full profile updates
    if (updates.client_name !== undefined) dbUpdates.client_name = updates.client_name;
    if (updates.clientName !== undefined) dbUpdates.client_name = updates.clientName;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.emirate !== undefined) dbUpdates.emirate = updates.emirate;
    
    if (updates.payment_method !== undefined) dbUpdates.payment_method = updates.payment_method;
    if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
    
    if (updates.delivery_fee !== undefined) dbUpdates.delivery_fee = updates.delivery_fee;
    if (updates.delivery !== undefined) dbUpdates.delivery_fee = updates.delivery;
    
    if (updates.total_amount !== undefined) dbUpdates.total_amount = updates.total_amount;
    if (updates.total !== undefined) dbUpdates.total_amount = updates.total;

    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .update(dbUpdates)
        .eq('id', id)
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase update failed, editing local storage data.', error);
    }

    const local = getLocalOrders();
    const updated = local.map(order => {
      if (order.id === id) {
        return { ...order, ...dbUpdates };
      }
      return order;
    });
    saveLocalOrders(updated);
    return updated.find(o => o.id === id);
  },

  // Delete order record
  async deleteOrder(id) {
    if (supabase) {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);
      
      if (!error) return true;
      console.warn('Supabase delete failed, removing from local storage.', error);
    }

    const local = getLocalOrders();
    const filtered = local.filter(order => order.id !== id);
    saveLocalOrders(filtered);
    return true;
  },

  // =========================================================================
  // PRODUCTS CRUD METHODS
  // =========================================================================

  // Fetch all products
  async getProducts() {
    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      
      if (!error) return data;
      console.warn('Supabase read products failed, fallback to local storage.', error);
    }
    return getLocalProducts();
  },

  // Create new product
  async insertProduct(productPayload) {
    const newRecord = {
      id: productPayload.id || `prod-${Date.now()}`,
      name: productPayload.name,
      slug: productPayload.slug || productPayload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: productPayload.category,
      price: parseFloat(productPayload.price),
      stock_status: productPayload.stock_status || 'in_stock',
      stock_quantity: parseInt(productPayload.stock_quantity || 10),
      scent_family: productPayload.scent_family || '',
      key_notes: productPayload.key_notes || [],
      description: productPayload.description || '',
      scent_mixes: productPayload.scent_mixes || '',
      sillage: parseInt(productPayload.sillage || 70),
      longevity: parseInt(productPayload.longevity || 75),
      gender: parseInt(productPayload.gender || 50),
      batch_details: productPayload.batch_details || 'Hand-blended in Dubai',
      scarcity_note: productPayload.scarcity_note || '',
      images: productPayload.images || [],
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .insert([newRecord])
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase product insert failed, fallback to local storage.', error);
    }

    const local = getLocalProducts();
    local.push(newRecord);
    saveLocalProducts(local);
    return newRecord;
  },

  // Update existing product
  async updateProduct(id, updates) {
    // Map fields
    const dbUpdates = { ...updates };
    if (updates.price !== undefined) dbUpdates.price = parseFloat(updates.price);
    if (updates.sillage !== undefined) dbUpdates.sillage = parseInt(updates.sillage);
    if (updates.longevity !== undefined) dbUpdates.longevity = parseInt(updates.longevity);
    if (updates.gender !== undefined) dbUpdates.gender = parseInt(updates.gender);
    if (updates.stock_quantity !== undefined) dbUpdates.stock_quantity = parseInt(updates.stock_quantity);

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .update(dbUpdates)
        .eq('id', id)
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase product update failed, editing local storage.', error);
    }

    const local = getLocalProducts();
    const updated = local.map(p => {
      if (p.id === id) {
        return { ...p, ...dbUpdates };
      }
      return p;
    });
    saveLocalProducts(updated);
    return updated.find(p => p.id === id);
  },

  // Delete product
  async deleteProduct(id) {
    if (supabase) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (!error) return true;
      console.warn('Supabase product delete failed, removing locally.', error);
    }

    const local = getLocalProducts();
    const filtered = local.filter(p => p.id !== id);
    saveLocalProducts(filtered);
    return true;
  },

  // =========================================================================
  // BLOGS CRUD METHODS
  // =========================================================================

  // Fetch all blogs
  async getBlogs() {
    if (supabase) {
      const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error) return data;
      console.warn('Supabase read blogs failed, fallback to local storage.', error);
    }
    return getLocalBlogs();
  },

  // Create new blog
  async insertBlog(blogPayload) {
    const newRecord = {
      id: blogPayload.id || `blog-${Date.now()}`,
      title: blogPayload.title,
      slug: blogPayload.slug || blogPayload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: blogPayload.category,
      excerpt: blogPayload.excerpt || '',
      content: blogPayload.content || '',
      image_url: blogPayload.image_url || 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&q=80&w=600',
      extra_images: blogPayload.extra_images || [],
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('blogs')
        .insert([newRecord])
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase blog insert failed, fallback to local storage.', error);
    }

    const local = getLocalBlogs();
    local.unshift(newRecord);
    saveLocalBlogs(local);
    return newRecord;
  },

  // Update blog
  async updateBlog(id, updates) {
    const dbUpdates = { ...updates };
    
    if (supabase) {
      const { data, error } = await supabase
        .from('blogs')
        .update(dbUpdates)
        .eq('id', id)
        .select();
      
      if (!error && data) return data[0];
      console.warn('Supabase blog update failed, editing local storage.', error);
    }

    const local = getLocalBlogs();
    const updated = local.map(b => {
      if (b.id === id) {
        return { ...b, ...dbUpdates };
      }
      return b;
    });
    saveLocalBlogs(updated);
    return updated.find(b => b.id === id);
  },

  // Delete blog
  async deleteBlog(id) {
    if (supabase) {
      const { error } = await supabase
        .from('blogs')
        .delete()
        .eq('id', id);
      
      if (!error) return true;
      console.warn('Supabase blog delete failed, removing locally.', error);
    }

    const local = getLocalBlogs();
    const filtered = local.filter(b => b.id !== id);
    saveLocalBlogs(filtered);
    return true;
  }
};
