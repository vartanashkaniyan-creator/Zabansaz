/**
 * 🚀 HyperLang Pro - Advanced Service Worker v1.0.0
 * Service Worker پیشرفته با قابلیت‌های کامل برای ۱۴ زبان
 * ویژگی‌ها: Caching هوشمند، Background Sync، Push Notifications، Offline Support
 */

// ==================== CONFIGURATION ====================
const APP_VERSION = 'hyperlang-v1.0.0-14lang';
const CACHE_NAME = `hyperlang-cache-${APP_VERSION}`;
const API_CACHE_NAME = `hyperlang-api-cache-${APP_VERSION}`;
const ASSETS_CACHE_NAME = `hyperlang-assets-cache-${APP_VERSION}`;

// Core Application Assets (Critical)
const CORE_ASSETS = [
    // HTML Files
    './web_index.html',
    
    // Manifest & Icons
    './web_manifest.json',
    
    // Web App Assets
    './assets/icons/icon-72x72.png',
    './assets/icons/icon-96x96.png',
    './assets/icons/icon-128x128.png',
    './assets/icons/icon-144x144.png',
    './assets/icons/icon-152x152.png',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-384x384.png',
    './assets/icons/icon-512x512.png',
    
    // Fonts
    'https://cdn.jsdelivr.net/gh/rastikerdar/vazir-font@v30.1.0/dist/Vazir.woff2',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Sans+JP:wght@300;400;500;700&display=swap'
];

// API Endpoints to Cache (Dynamic Data)
const API_ENDPOINTS = [
    '/api/v1/languages',
    '/api/v1/languages/statistics',
    '/api/v1/vocabulary',
    '/api/v1/lessons',
    '/api/v1/user/progress',
    '/api/v1/config'
];

// Static Assets Patterns
const STATIC_PATTERNS = [
    /\.css$/,
    /\.js$/,
    /\.woff2$/,
    /\.woff$/,
    /\.ttf$/,
    /\.eot$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.svg$/,
    /\.ico$/
];

// Cache Strategies Configuration
const CACHE_STRATEGIES = {
    CACHE_FIRST: 'cache-first',
    NETWORK_FIRST: 'network-first',
    NETWORK_ONLY: 'network-only',
    CACHE_ONLY: 'cache-only',
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// ==================== SERVICE WORKER LIFECYCLE ====================

/**
 * Install Event - Cache core assets
 */
self.addEventListener('install', (event) => {
    console.log(`🛠️ Service Worker installing: ${APP_VERSION}`);
    
    event.waitUntil(
        (async () => {
            try {
                // Open caches
                const [coreCache, assetsCache] = await Promise.all([
                    caches.open(CACHE_NAME),
                    caches.open(ASSETS_CACHE_NAME)
                ]);
                
                // Cache core assets (critical for first load)
                await coreCache.addAll(CORE_ASSETS);
                
                // Pre-cache language-specific assets
                await preCacheLanguageAssets(assetsCache);
                
                // Skip waiting to activate immediately
                await self.skipWaiting();
                
                console.log(`✅ Installation complete: ${APP_VERSION}`);
                console.log(`📦 Cached ${CORE_ASSETS.length} core assets`);
            } catch (error) {
                console.error('❌ Installation failed:', error);
                throw error;
            }
        })()
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log(`🚀 Service Worker activating: ${APP_VERSION}`);
    
    event.waitUntil(
        (async () => {
            try {
                // Clean up old caches
                const cacheKeys = await caches.keys();
                const deletePromises = cacheKeys.map((cacheKey) => {
                    if (!cacheKey.includes(APP_VERSION)) {
                        console.log(`🗑️ Deleting old cache: ${cacheKey}`);
                        return caches.delete(cacheKey);
                    }
                });
                
                await Promise.all(deletePromises);
                
                // Claim clients immediately
                await self.clients.claim();
                
                // Initialize background sync
                await initializeBackgroundSync();
                
                console.log(`✅ Activation complete: ${APP_VERSION}`);
                console.log(`👑 Now controlling: ${(await self.clients.matchAll()).length} clients`);
            } catch (error) {
                console.error('❌ Activation failed:', error);
            }
        })()
    );
});

// ==================== CACHE MANAGEMENT ====================

/**
 * Pre-cache language-specific assets
 */
async function preCacheLanguageAssets(cache) {
    const languageAssets = [
        // Language flags (could be dynamically generated)
        './assets/flags/ir.png',
        './assets/flags/iq.png',
        './assets/flags/us.png',
        './assets/flags/de.png',
        './assets/flags/tr.png',
        './assets/flags/ru.png',
        './assets/flags/fr.png',
        './assets/flags/es.png',
        './assets/flags/br.png',
        './assets/flags/it.png',
        './assets/flags/nl.png',
        './assets/flags/se.png',
        './assets/flags/cn.png',
        './assets/flags/jp.png'
    ];
    
    try {
        await cache.addAll(languageAssets);
        console.log(`🎌 Pre-cached ${languageAssets.length} language assets`);
    } catch (error) {
        console.warn('⚠️ Some language assets failed to cache:', error);
    }
}

/**
 * Get appropriate cache for request type
 */
function getCacheForRequest(request) {
    const url = new URL(request.url);
    
    // API requests go to API cache
    if (API_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) {
        return API_CACHE_NAME;
    }
    
    // Static assets go to assets cache
    if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname))) {
        return ASSETS_CACHE_NAME;
    }
    
    // Everything else goes to main cache
    return CACHE_NAME;
}

/**
 * Get cache strategy for request
 */
function getCacheStrategy(request) {
    const url = new URL(request.url);
    
    // Critical assets - Cache First
    if (CORE_ASSETS.includes(url.pathname) || 
        url.pathname === './web_index.html' ||
        url.pathname === './web_manifest.json') {
        return CACHE_STRATEGIES.CACHE_FIRST;
    }
    
    // API data - Network First with aggressive caching
    if (API_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) {
        return CACHE_STRATEGIES.NETWORK_FIRST;
    }
    
    // Static assets - Cache First with revalidation
    if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname))) {
        return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE;
    }
    
    // Default - Network First
    return CACHE_STRATEGIES.NETWORK_FIRST;
}

// ==================== CACHE STRATEGIES IMPLEMENTATION ====================

/**
 * Cache First Strategy
 */
async function cacheFirst(request) {
    const cache = await caches.open(getCacheForRequest(request));
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        console.log(`📦 Serving from cache (cache-first): ${request.url}`);
        
        // Update cache in background if stale
        updateCacheInBackground(request, cache);
        
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the response for future use
            await cache.put(request, networkResponse.clone());
            console.log(`💾 Cached new resource: ${request.url}`);
        }
        
        return networkResponse;
    } catch (error) {
        console.error(`❌ Cache-first fetch failed: ${request.url}`, error);
        
        // Return offline page for HTML requests
        if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('./web_index.html');
        }
        
        return new Response('Network error and no cache available', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Network First Strategy
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the successful response
            const cache = await caches.open(getCacheForRequest(request));
            await cache.put(request, networkResponse.clone());
            console.log(`💾 Cached API response: ${request.url}`);
        }
        
        return networkResponse;
    } catch (error) {
        console.log(`🌐 Network failed, trying cache: ${request.url}`);
        
        // Try cache
        const cache = await caches.open(getCacheForRequest(request));
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log(`📦 Serving from cache (network failed): ${request.url}`);
            return cachedResponse;
        }
        
        // No cache available
        return new Response('You are offline and no cached data is available', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Stale While Revalidate Strategy
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(getCacheForRequest(request));
    const cachedResponse = await cache.match(request);
    
    // Return cached response immediately
    const fetchPromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse.ok) {
            // Update cache with new response
            await cache.put(request, networkResponse.clone());
            console.log(`🔄 Cache updated: ${request.url}`);
        }
        return networkResponse;
    }).catch(error => {
        console.warn(`⚠️ Background fetch failed: ${request.url}`, error);
    });
    
    // Don't wait for fetch promise to return cached response
    if (cachedResponse) {
        console.log(`⚡ Serving stale while revalidating: ${request.url}`);
        return cachedResponse;
    }
    
    // No cache, wait for network
    return await fetchPromise;
}

/**
 * Update cache in background (for stale-while-revalidate)
 */
async function updateCacheInBackground(request, cache) {
    // Only update if not too recent
    const cachedResponse = await cache.match(request);
    if (!cachedResponse) return;
    
    const cachedDate = new Date(cachedResponse.headers.get('date') || Date.now());
    const age = Date.now() - cachedDate.getTime();
    
    // Update if older than 1 hour
    if (age > 60 * 60 * 1000) {
        fetch(request).then(async (networkResponse) => {
            if (networkResponse.ok) {
                await cache.put(request, networkResponse.clone());
                console.log(`🔄 Background cache update: ${request.url}`);
            }
        }).catch(error => {
            console.warn(`⚠️ Background update failed: ${request.url}`, error);
        });
    }
}

// ==================== FETCH EVENT HANDLER ====================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip browser extensions
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Skip analytics/telemetry (optional)
    if (url.hostname.includes('google-analytics') || 
        url.hostname.includes('googletagmanager')) {
        return event.respondWith(fetch(request));
    }
    
    // Select strategy based on request
    const strategy = getCacheStrategy(request);
    
    let responsePromise;
    switch (strategy) {
        case CACHE_STRATEGIES.CACHE_FIRST:
            responsePromise = cacheFirst(request);
            break;
            
        case CACHE_STRATEGIES.NETWORK_FIRST:
            responsePromise = networkFirst(request);
            break;
            
        case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
            responsePromise = staleWhileRevalidate(request);
            break;
            
        case CACHE_STRATEGIES.NETWORK_ONLY:
            responsePromise = fetch(request);
            break;
            
        case CACHE_STRATEGIES.CACHE_ONLY:
            responsePromise = caches.match(request);
            break;
            
        default:
            responsePromise = networkFirst(request);
    }
    
    event.respondWith(responsePromise);
});

// ==================== BACKGROUND SYNC ====================

async function initializeBackgroundSync() {
    // Register sync event listener
    self.addEventListener('sync', (event) => {
        console.log(`🔄 Background sync triggered: ${event.tag}`);
        
        switch (event.tag) {
            case 'sync-user-progress':
                event.waitUntil(syncUserProgress());
                break;
                
            case 'sync-language-data':
                event.waitUntil(syncLanguageData());
                break;
                
            case 'sync-vocabulary':
                event.waitUntil(syncVocabulary());
                break;
                
            default:
                console.log(`Unknown sync tag: ${event.tag}`);
        }
    });
}

/**
 * Sync user progress data
 */
async function syncUserProgress() {
    try {
        // Get pending progress from IndexedDB
        const pendingProgress = await getPendingProgressFromIndexedDB();
        
        if (pendingProgress.length === 0) {
            console.log('✅ No pending progress to sync');
            return;
        }
        
        console.log(`🔄 Syncing ${pendingProgress.length} progress items`);
        
        // Sync each item
        const syncPromises = pendingProgress.map(progress => 
            syncProgressItem(progress)
        );
        
        const results = await Promise.allSettled(syncPromises);
        
        // Log results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`📊 Sync completed: ${successful} successful, ${failed} failed`);
        
        // Update sync status in IndexedDB
        await updateSyncStatus(results);
        
    } catch (error) {
        console.error('❌ Background sync failed:', error);
        throw error; // Retry on next sync
    }
}

/**
 * Sync language data updates
 */
async function syncLanguageData() {
    // Implementation for syncing language-specific data
    console.log('🔄 Syncing language data');
    
    try {
        // Fetch updated language data
        const response = await fetch('/api/v1/languages/updates', {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (response.ok) {
            const updates = await response.json();
            await applyLanguageUpdates(updates);
            console.log('✅ Language data synced successfully');
        }
    } catch (error) {
        console.error('❌ Language data sync failed:', error);
    }
}

/**
 * Sync vocabulary updates
 */
async function syncVocabulary() {
    console.log('🔄 Syncing vocabulary data');
    // Similar implementation to syncLanguageData
}

// ==================== PUSH NOTIFICATIONS ====================

self.addEventListener('push', (event) => {
    console.log('📬 Push notification received');
    
    if (!event.data) {
        console.log('⚠️ Push event has no data');
        return;
    }
    
    let data;
    try {
        data = event.data.json();
    } catch (error) {
        console.log('⚠️ Push data is not JSON, using text');
        data = {
            title: 'HyperLang',
            body: event.data.text() || 'یادگیری زبان جدید منتظر شماست!',
            icon: './assets/icons/icon-192.png',
            badge: './assets/icons/icon-192.png',
            tag: 'lang-reminder',
            timestamp: Date.now()
        };
    }
    
    // Default notification options
    const options = {
        body: data.body || 'یادگیری زبان جدید منتظر شماست!',
        icon: data.icon || './assets/icons/icon-192.png',
        badge: data.badge || './assets/icons/icon-192.png',
        tag: data.tag || 'lang-reminder',
        timestamp: data.timestamp || Date.now(),
        data: {
            url: data.url || './web_index.html',
            language: data.language || 'en',
            type: data.type || 'reminder'
        },
        actions: [
            {
                action: 'practice',
                title: '📝 تمرین کن',
                icon: './assets/icons/practice.png'
            },
            {
                action: 'review',
                title: '🔄 مرور کن',
                icon: './assets/icons/review.png'
            },
            {
                action: 'dismiss',
                title: '❌ بستن',
                icon: './assets/icons/close.png'
            }
        ],
        vibrate: [200, 100, 200],
        requireInteraction: true,
        silent: false
    };
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(data.title || 'HyperLang', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('👆 Notification clicked:', event.action);
    
    event.notification.close();
    
    const notificationData = event.notification.data || {};
    let url = notificationData.url || './web_index.html';
    
    // Handle different actions
    switch (event.action) {
        case 'practice':
            url += `?practice=${notificationData.language || 'en'}`;
            break;
            
        case 'review':
            url += `?review=true&language=${notificationData.language || 'en'}`;
            break;
            
        case 'dismiss':
            // Just close the notification
            return;
    }
    
    // Open or focus the window
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Check if there's already a window open
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open a new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('📪 Notification closed');
    // Could send analytics here
});

// ==================== PERIODIC SYNC ====================

// Register for periodic background sync (if supported)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', (event) => {
        if (event.tag === 'update-language-content') {
            console.log('🔄 Periodic sync triggered');
            event.waitUntil(updateLanguageContent());
        }
    });
}

async function updateLanguageContent() {
    try {
        // Fetch updates for all languages
        const languages = ['fa', 'en', 'ar-iq', 'de', 'tr', 'ru', 'fr', 'es', 'pt-br', 'it', 'nl', 'sv', 'zh', 'ja'];
        
        const updatePromises = languages.map(lang => 
            fetch(`/api/v1/languages/${lang}/updates`)
                .then(response => response.ok ? response.json() : null)
                .catch(() => null)
        );
        
        await Promise.allSettled(updatePromises);
        console.log('✅ Periodic content update completed');
    } catch (error) {
        console.error('❌ Periodic sync failed:', error);
    }
}

// ==================== INDEXEDDB HELPERS ====================

async function getPendingProgressFromIndexedDB() {
    // This would interact with your IndexedDB database
    // For now, return empty array
    return [];
}

async function syncProgressItem(progress) {
    // Implementation for syncing a single progress item
    return Promise.resolve();
}

async function updateSyncStatus(results) {
    // Update IndexedDB with sync results
}

async function applyLanguageUpdates(updates) {
    // Apply language updates to local storage
}

// ==================== ERROR HANDLING ====================

self.addEventListener('error', (event) => {
    console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection in Service Worker:', event.reason);
});

// ==================== LOGGING UTILITY ====================

function logCacheStatus() {
    caches.keys().then(cacheNames => {
        console.log('📊 Cache status:');
        cacheNames.forEach(cacheName => {
            caches.open(cacheName).then(cache => {
                cache.keys().then(requests => {
                    console.log(`${cacheName}: ${requests.length} items`);
                });
            });
        });
    });
}

// Log cache status periodically (every 6 hours)
setInterval(logCacheStatus, 6 * 60 * 60 * 1000);

// Initial log
self.addEventListener('activate', () => {
    setTimeout(logCacheStatus, 5000);
});

console.log(`🚀 HyperLang Service Worker ${APP_VERSION} loaded successfully`);
