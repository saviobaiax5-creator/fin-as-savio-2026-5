/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "481e0382a66f284c67a0bbd9a2973d54"
  }, {
    "url": "pwa-512x512.png",
    "revision": "5e8ac64af9845550bd2f211d3dcd00a0"
  }, {
    "url": "pwa-192x192.png",
    "revision": "71ea82f81117be984ea922d068cb7800"
  }, {
    "url": "index.html",
    "revision": "1001ac9cb3b5dc82027fdd782a60c665"
  }, {
    "url": "icon.svg",
    "revision": "6184939731b0f8aab0ef55908278dda7"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "943f6a38c197f26fc7b10e1acd176720"
  }, {
    "url": "icons/savio-financas.svg",
    "revision": "b3baff25293a352f59761d3f38b2e91b"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-DDrqV9Fi.css",
    "revision": null
  }, {
    "url": "assets/index-BfsbsI0L.js",
    "revision": null
  }, {
    "url": "assets/aistudio/finance_ia_prototipo_b34d3cd6.html",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "943f6a38c197f26fc7b10e1acd176720"
  }, {
    "url": "icon.svg",
    "revision": "6184939731b0f8aab0ef55908278dda7"
  }, {
    "url": "pwa-192x192.png",
    "revision": "71ea82f81117be984ea922d068cb7800"
  }, {
    "url": "pwa-512x512.png",
    "revision": "5e8ac64af9845550bd2f211d3dcd00a0"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "481e0382a66f284c67a0bbd9a2973d54"
  }, {
    "url": "icons/savio-financas.svg",
    "revision": "b3baff25293a352f59761d3f38b2e91b"
  }, {
    "url": "manifest.webmanifest",
    "revision": "5bc349bc383bcb0836cdb4755efa4b63"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
