const CMP_SCRIPT = `(async function () {
    let isLoadingState = false;
    let consentState = {};
    let observer;
    let isInitialized = false;
    const blockedScripts = [];
    let categorizedScripts = null;
    
    // Security utilities
    const SecurityUtils = {
      async hashData(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      },
  
      async getSecureToken() {
        try {
          const token = localStorage.getItem('session-token');
          if (!token) {
            console.error('No session token found');
            return null;
          }
          return await this.hashData(token);
        } catch (error) {
          console.error('Error getting secure token:', error);
          return null;
        }
      },
  
      validateScript(script) {
        if (!script) return false;
        
        // Validate URL if present
        if (script.url) {
          try {
            new URL(script.url);
          } catch {
            return false;
          }
        }
  
        // Validate category if present
        if (script.category && typeof script.category !== 'string') {
          return false;
        }
  
        // Validate name if present
        if (script.name && typeof script.name !== 'string') {
          return false;
        }
  
        return true;
      }
    };
  
    async function loadCategorizedScripts() {
      try {
        const hashedToken = await SecurityUtils.getSecureToken();
        if (!hashedToken) {
          console.error('Failed to get secure token');
          return null;
        }
  
        const response = await fetch('/api/script-categories', {
          headers: {
            'Authorization': \`Bearer \${hashedToken}\`,
            'X-Request-ID': crypto.randomUUID()
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to load categorized scripts:', errorData);
          return null;
        }
        
        const data = await response.json();
        if (!data.scripts || !Array.isArray(data.scripts)) {
          console.error('Invalid script data format');
          return null;
        }
  
        // Validate and filter scripts
        return data.scripts.filter(script => SecurityUtils.validateScript(script));
      } catch (error) {
        console.error('Error loading categorized scripts:', error);
        return null;
      }
    }
  
    async function isScriptCategorized(scriptContent) {
      if (!categorizedScripts) {
        categorizedScripts = await loadCategorizedScripts();
      }
  
      if (!categorizedScripts) {
        console.warn('No categorized scripts available');
        return false;
      }
  
      return categorizedScripts.some(script => 
        script.script === scriptContent || 
        (script.url && scriptContent.includes(script.url))
      );
    }
  
    async function blockAllScripts() {
      blockMetaFunctions();
      blockAnalyticsRequests();
      await scanAndBlockScripts();
      blockDynamicScripts();
      createPlaceholderScripts();
      
      if (!consentState.marketing) {
        blockMarketingScripts();
      }
      if (!consentState.personalization) {
        blockPersonalizationScripts();
      }
      if (!consentState.analytics) {
        blockAnalyticsScripts();
      }
    }
  
    async function loadConsentState() {
      if (isLoadingState) return;
      isLoadingState = true;
  
      blockAllInitialRequests();
      blockAllScripts();
      
      const consentGiven = localStorage.getItem("consent-given");
      
      if (consentGiven === "true") {
        try {
          const savedPreferences = JSON.parse(localStorage.getItem("consent-preferences"));
          if (savedPreferences?.encryptedData) {
            const decryptedData = await decryptData(
              savedPreferences.encryptedData,
              await importKey(Uint8Array.from(savedPreferences.key)),
              Uint8Array.from(savedPreferences.iv)
            );
            consentState = JSON.parse(decryptedData);
            consentState = {
              necessary: consentState.necessary || true,
              marketing: consentState.marketing || false,
              personalization: consentState.personalization || false,
              analytics: consentState.analytics || false,
              ccpa: {
                doNotShare: consentState.ccpa?.doNotShare || false
              }
            };
  
            // Update checkbox states
            const necessaryCheckbox = document.getElementById("necessary-checkbox");
            const marketingCheckbox = document.getElementById("marketing-checkbox");
            const personalizationCheckbox = document.getElementById("personalization-checkbox");
            const analyticsCheckbox = document.getElementById("analytics-checkbox");
            const doNotShareCheckbox = document.getElementById("do-not-share-checkbox");
  
            if (necessaryCheckbox) {
              necessaryCheckbox.checked = true;
              necessaryCheckbox.disabled = true;
            }
            if (marketingCheckbox) marketingCheckbox.checked = consentState.marketing || false;
            if (personalizationCheckbox) personalizationCheckbox.checked = consentState.personalization || false;
            if (analyticsCheckbox) analyticsCheckbox.checked = consentState.analytics || false;
            if (doNotShareCheckbox) doNotShareCheckbox.checked = consentState.ccpa.doNotShare || false;
          }
        } catch (error) {
          console.error("Error loading consent state:", error);
          consentState = { 
            necessary: true,
            marketing: false,
            personalization: false,
            analytics: false,
            ccpa: { doNotShare: false } 
          };
        }
      } else {
        consentState = { 
          necessary: true,
          marketing: false,
          personalization: false,
          analytics: false,
          ccpa: { doNotShare: false } 
        };
      }
    
      initialBlockingEnabled = !consentState.analytics;
      blockAllScripts();
      
      if (!initialBlockingEnabled) {
        unblockScripts();
      }
      isLoadingState = false;
    }
  
    async function scanAndBlockScripts() {
      const scripts = document.querySelectorAll("script[src]");
      const inlineScripts = document.querySelectorAll("script:not([src])");
      
      // Handle external scripts
      for (const script of scripts) {
        if (isSuspiciousResource(script.src)) {
          const isCategorized = await isScriptCategorized(script.src);
          if (!isCategorized) {
            console.log("Blocking uncategorized script:", script.src);
            const placeholder = createPlaceholder(script);
            script.parentNode.replaceChild(placeholder, script);
            blockedScripts.push(placeholder);
          } else {
            console.log("Script is categorized, allowing:", script.src);
          }
        }
      }
  
      // Handle inline scripts
      for (const script of inlineScripts) {
        const content = script.textContent;
        if (content.match(/gtag|ga|fbq|twq|pintrk|snaptr|_qevents|dataLayer|plausible/)) {
          const isCategorized = await isScriptCategorized(content);
          if (!isCategorized) {
            script.remove();
          } else {
            console.log("Inline script is categorized, allowing");
          }
        }
      }
    }
  
    async function unblockScripts() {
      for (const placeholder of blockedScripts) {
        if (placeholder.dataset.src) {
          const isCategorized = await isScriptCategorized(placeholder.dataset.src);
          if (isCategorized) {
            const script = document.createElement('script');
            script.src = placeholder.dataset.src;
            script.async = placeholder.dataset.async === 'true';
            script.defer = placeholder.dataset.defer === 'true';
            script.type = placeholder.dataset.type;
            if (placeholder.dataset.crossorigin) {
              script.crossOrigin = placeholder.dataset.crossorigin;
            }
            
            script.onload = () => {
              console.log("Loaded categorized script:", script.src);
              if (script.src.includes('fbevents.js')) {
                initializeFbq();
              }
            };
            
            placeholder.parentNode.replaceChild(script, placeholder);
          }
        }
      }
      
      blockedScripts.length = 0;
  
      if (observer) observer.disconnect();
      headObserver.disconnect();
      
      if (window.fbqBlocked) {
        delete window.fbqBlocked;
        loadScript("https://connect.facebook.net/en_US/fbevents.js", initializeFbq);
      }
    }
  
    function createPlaceholder(script) {
      const placeholder = document.createElement('script');
      placeholder.type = 'text/placeholder';
      placeholder.dataset.src = script.src;
      placeholder.dataset.async = script.async || false;
      placeholder.dataset.defer = script.defer || false;
      placeholder.dataset.type = script.type || 'text/javascript';
      placeholder.dataset.crossorigin = script.crossOrigin || '';
      return placeholder;
    }
  
    function isSuspiciousResource(url) {
      const suspiciousPatterns = /gtag|analytics|zoho|track|collect|googletagmanager|googleanalytics|metrics|pageview|stat|trackpageview|pixel|doubleclick|adservice|adwords|adsense|connect\.facebook\.net|fbevents\.js|facebook|meta|graph\.facebook\.com|business\.facebook\.com|pixel|quantserve|scorecardresearch|clarity\.ms|hotjar|mouseflow|fullstory|logrocket|mixpanel|segment|amplitude|heap|kissmetrics|matomo|piwik|woopra|crazyegg|clicktale|optimizely|hubspot|marketo|pardot|salesforce|intercom|drift|zendesk|freshchat|tawk|livechat|olark|purechat|snapengage|liveperson|boldchat|clickdesk|userlike|zopim|crisp|linkedin|twitter|pinterest|tiktok|snap|reddit|quora|outbrain|taboola|sharethrough|moat|integral-marketing|comscore|nielsen|quantcast|adobe|marketo|hubspot|salesforce|pardot|eloqua|act-on|mailchimp|constantcontact|sendgrid|klaviyo|braze|iterable|appsflyer|adjust|branch|kochava|singular|tune|attribution|chartbeat|parse\.ly|newrelic|datadog|sentry|rollbar|bugsnag|raygun|loggly|splunk|elastic|dynatrace|appoptics|pingdom|uptimerobot|statuscake|newrelic|datadoghq|sentry\.io|rollbar\.com|bugsnag\.com|raygun\.io|loggly\.com|splunk\.com|elastic\.co|dynatrace\.com|appoptics\.com|pingdom\.com|uptimerobot\.com|statuscake\.com|clarity|clickagy|yandex|baidu/;
      const isSuspicious = suspiciousPatterns.test(url);
      if (isSuspicious) {
        console.log("Suspicious script detected:", url);
      }
      return isSuspicious;
    }
  
    function blockAnalyticsScripts() {
      const analyticsPatterns = /collect|plausible.io|googletagmanager|google-analytics|gtag|analytics|zoho|track|collect|googletagmanager|googleanalytics|metrics|pageview|stat|trackpageview/i;
      
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach(script => {
        if (analyticsPatterns.test(script.src)) {
          console.log("Blocking Analytics Script:", script.src);
          const placeholder = createPlaceholder(script);
          script.parentNode.replaceChild(placeholder, script);
          blockedScripts.push(placeholder);
        }
      });
    }
  
    function blockMarketingScripts() {
      const marketingPatterns = /facebook|meta|fbevents|linkedin|twitter|pinterest|tiktok|snap|reddit|quora|outbrain|taboola|sharethrough/i;
      
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach(script => {
        if (marketingPatterns.test(script.src)) {
          console.log("Blocking Marketing Script:", script.src);
          const placeholder = createPlaceholder(script);
          script.parentNode.replaceChild(placeholder, script);
          blockedScripts.push(placeholder);
        }
      });
    }
  
    function blockPersonalizationScripts() {
      const personalizationPatterns = /optimizely|hubspot|marketo|pardot|salesforce|intercom|drift|zendesk|freshchat|tawk|livechat/i;
      
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach(script => {
        if (personalizationPatterns.test(script.src)) {
          console.log("Blocking Personalization Script:", script.src);
          const placeholder = createPlaceholder(script);
          script.parentNode.replaceChild(placeholder, script);
          blockedScripts.push(placeholder);
        }
      });
    }
  
    function blockAnalyticsRequests() {
      const originalFetch = window.fetch;
      window.fetch = function (...args) {
        const url = args[0];
        if (typeof url === "string" && !consentState.analytics && isSuspiciousResource(url)) {
          return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
        }
        return originalFetch.apply(this, args);
      };
  
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        
        xhr.open = function(method, url) {
          if (typeof url === "string" && !consentState.analytics && isSuspiciousResource(url)) {
            return;
          }
          return originalOpen.apply(xhr, arguments);
        };
        return xhr;
      };
    }
  
    function blockMetaFunctions() {
      if (!consentState.analytics) {
        if (!window.fbqBlocked) {
          window.fbqBlocked = window.fbq || function () {
            window.fbq.queue.push(arguments);
          };
          window.fbqBlocked.queue = [];
          window.fbq = window.fbqBlocked;
        }
      } else {
        if (window.fbq === window.fbqBlocked) {
          delete window.fbqBlocked;
          delete window.fbq;
          loadScript("https://connect.facebook.net/en_US/fbevents.js", initializeFbq);
        }
      }
    }
  
    function initializeFbq() {
      if (window.fbq && window.fbq.queue) {
        window.fbq.queue.forEach(args => window.fbq.apply(null, args));
      }
    }
  
    let initialBlockingEnabled = true;
  
    function blockAllInitialRequests() {
      const originalFetch = window.fetch;
      window.fetch = function (...args) {
        const url = args[0];
        if (initialBlockingEnabled && isSuspiciousResource(url)) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return originalFetch.apply(this, args);
      };
  
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        
        xhr.open = function(method, url) {
          if (initialBlockingEnabled && isSuspiciousResource(url)) {
            return;
          }
          return originalOpen.apply(xhr, arguments);
        };
        return xhr;
      };
  
      const originalImage = window.Image;
      window.Image = function(...args) {
        const img = new originalImage(...args);
        img.setAttribute = function(name, value) {
          if (name === 'src' && initialBlockingEnabled && isSuspiciousResource(value)) {
            return;
          }
          return originalSetAttribute.apply(this, arguments);
        };
        return img;
      };
    }
  
    function getClientIdentifier() {
      return window.location.hostname;
    }
  
    async function generateKey() {
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const exportedKey = await crypto.subtle.exportKey("raw", key);
      return { secretKey: exportedKey, iv };
    }
  
    async function importKey(rawKey) {
      return await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
    }
  
    async function decryptData(encrypted, key, iv) {
      const encryptedBuffer = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encryptedBuffer
      );
      return new TextDecoder().decode(decrypted);
    }
  
    async function encryptData(data, key, iv) {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      const importedKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        importedKey,
        encodedData
      );
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }
  
    function getCookie(name) {
      const cookieString = document.cookie;
      if (!cookieString) return null;
      
      const cookies = Object.fromEntries(
        cookieString.split("; ").map(c => c.split("="))
      );
      
      return cookies[name] || null;
    }
  
    async function saveConsentState(preferences, country) {
      const clientId = getClientIdentifier();
      const visitorId = getCookie("visitorId") || crypto.randomUUID();
      const policyVersion = "1.2";
      const timestamp = new Date().toISOString();
      const ip = window.clientIp;
  
      const consentPreferences = {
        necessary: true,
        marketing: preferences.marketing || false,
        personalization: preferences.personalization || false,
        analytics: preferences.analytics || false,
        doNotShare: preferences.doNotShare || false,
        country: country,
        timestamp: timestamp,
        ip: ip,
        gdpr: {
          necessary: true,
          marketing: preferences.marketing || false,
          personalization: preferences.personalization || false,
          analytics: preferences.analytics || false,
          lastUpdated: timestamp,
          country: country
        },
        ccpa: {
          necessary: true,
          doNotShare: preferences.doNotShare || false,
          lastUpdated: timestamp,
          country: country
        }
      };
  
      const encryptionKey = await generateKey();
      const encryptedVisitorId = await encryptData(visitorId, encryptionKey.secretKey, encryptionKey.iv);
      const encryptedPreferences = await encryptData(JSON.stringify(consentPreferences), encryptionKey.secretKey, encryptionKey.iv);
  
      localStorage.setItem("consent-given", "true");
      localStorage.setItem("consent-preferences", JSON.stringify({
        encryptedData: encryptedPreferences,
        iv: Array.from(encryptionKey.iv),
        key: Array.from(new Uint8Array(encryptionKey.secretKey))
      }));
      localStorage.setItem("consent-timestamp", timestamp);
      localStorage.setItem("consent-policy-version", "1.2");
  
      const payload = {
        clientId,
        visitorId: {
          encryptedData: encryptedVisitorId,
          iv: Array.from(encryptionKey.iv),
          key: Array.from(new Uint8Array(encryptionKey.secretKey))
        },
        preferences: {
          encryptedData: encryptedPreferences,
          iv: Array.from(encryptionKey.iv),
          key: Array.from(new Uint8Array(encryptionKey.secretKey))
        },
        metadata: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ip: ip
        },
        policyVersion,
        timestamp
      };
  
      try {
        const tokenResponse = await fetch("https://app.consentbit.com/cmp/request-token");
        const tokenData = await tokenResponse.json();
        const token = tokenData.token;
        
        if (!token) {
          console.error("Failed to retrieve authentication token.");
          return;
        }
  
        const response = await fetch("https://app.consentbit.com/cmp/consent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Token": token
          },
          body: JSON.stringify(payload),
        });
  
        const text = await response.text();
      } catch (error) {
        console.error("Error sending consent data:", error);
      }
    }
  
    const headObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.tagName === 'SCRIPT' && isSuspiciousResource(node.src)) {
            node.remove();
          }
        });
      });
    });
  
    headObserver.observe(document.head, { childList: true, subtree: true });
  
    function blockDynamicScripts() {
      if (observer) observer.disconnect();
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === "SCRIPT" && isSuspiciousResource(node.src)) {
              console.log("Blocking dynamically added script:", node.src);
              node.remove();
            }
            if (node.tagName === "IFRAME" && isSuspiciousResource(node.src)) {
              node.remove();
            }
            if (node.tagName === "IMG" && isSuspiciousResource(node.src)) {
              node.remove();
            }
          });
        });
      });
  
      observer.observe(document.body, { childList: true, subtree: true });
    }
  
    function createPlaceholderScripts() {
      const allScripts = document.querySelectorAll('script');
      allScripts.forEach(script => {
        if (isSuspiciousResource(script.src)) {
          const placeholder = document.createElement('script');
          placeholder.type = 'text/placeholder';
          placeholder.dataset.src = script.src;
          placeholder.dataset.async = script.async;
          script.parentNode.replaceChild(placeholder, script);
          blockedScripts.push(placeholder);
        }
      });
    }
  
    function revalidateBlockedScripts() {
      if (!consentState.analytics) {
        scanAndBlockScripts();
        blockDynamicScripts();
      }
    }
  
    function updateConsentState(preferences) {
      consentState = preferences;
      initialBlockingEnabled = !preferences.analytics;
  
      if (preferences.doNotShare) {
        blockMarketingScripts();
        blockPersonalizationScripts();
        blockAnalyticsScripts();
      } else {
        if (preferences.marketing) {
          unblockScripts();
        }
        if (preferences.personalization) {
          unblockScripts();
        }
        if (preferences.analytics) {
          unblockScripts();
        }
      }
      
      if (preferences.analytics) {
        unblockScripts();
      } else {
        blockAllScripts();
      }
      
      saveConsentState(preferences, currentLocation.country);
    }
  
    function loadScript(src, callback) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = callback;
      document.head.appendChild(script);
    }
  
    function showBanner(banner) {
      if (banner) {
        banner.style.display = "block";
        banner.classList.add("show-banner");
        banner.classList.remove("hidden");
      }
    }
  
    function hideBanner(banner) {
      if (banner) {
        banner.style.display = "none";
        banner.classList.remove("show-banner");
        banner.classList.add("hidden");
      }
    }
  
    function attachBannerHandlers() {
      const consentBanner = document.getElementById("consent-banner");
      const ccpaBanner = document.getElementById("initial-consent-banner");
      const mainBanner = document.getElementById("main-banner");
      const mainConsentBanner = document.getElementById("main-consent-banner");
      const simpleBanner = document.getElementById("simple-consent-banner");
      const simpleAcceptButton = document.getElementById("simple-accept");
      const simpleRejectButton = document.getElementById("simple-reject");
      const toggleConsentButton = document.getElementById("toggle-consent-btn");
      const newToggleConsentButton = document.getElementById("new-toggle-consent-btn");
      const acceptButton = document.getElementById("accept-btn");
      const declineButton = document.getElementById("decline-btn");
      const preferencesButton = document.getElementById("preferences-btn");
      const savePreferencesButton = document.getElementById("save-preferences-btn");
      const saveCCPAPreferencesButton = document.getElementById("save-btn");
      const cancelButton = document.getElementById("cancel-btn");
      const closeConsentButton = document.getElementById("close-consent-banner");
      const doNotShareLink = document.getElementById("do-not-share-link");
      const necessaryCheckbox = document.getElementById("necessary-checkbox");
      const marketingCheckbox = document.getElementById("marketing-checkbox");
      const personalizationCheckbox = document.getElementById("personalization-checkbox");
      const analyticsCheckbox = document.getElementById("analytics-checkbox");
      const doNotShareCheckbox = document.getElementById("do-not-share-checkbox");
  
      if (simpleBanner) {
        showBanner(simpleBanner);
  
        if (simpleAcceptButton) {
          simpleAcceptButton.addEventListener("click", async function(e) {
            e.preventDefault();
            const preferences = {
              necessary: true,
              marketing: true,
              personalization: true,
              analytics: true,
              doNotShare: false
            };
            await updateConsentState(preferences);
            unblockScripts();
            hideBanner(simpleBanner);
            localStorage.setItem("consent-given", "true");
          });
        }
  
        if (simpleRejectButton) {
          simpleRejectButton.addEventListener("click", async function(e) {
            e.preventDefault();
            const preferences = {
              necessary: true,
              marketing: false,
              personalization: false,
              analytics: false,
              doNotShare: true
            };
            await updateConsentState(preferences);
            blockAllScripts();
            hideBanner(simpleBanner);
            localStorage.setItem("consent-given", "true");
          });
        }
      }
  
      if (toggleConsentButton) {
        toggleConsentButton.addEventListener("click", function(e) {
          e.preventDefault();
          if (currentBannerType === 'GDPR') {
            showBanner(consentBanner);
            hideBanner(ccpaBanner);
          } else if (currentBannerType === 'CCPA') {
            showBanner(ccpaBanner);
            hideBanner(consentBanner);
          } else {
            showBanner(consentBanner);
            hideBanner(ccpaBanner);
          }
        });
      }
  
      if (newToggleConsentButton) {
        newToggleConsentButton.addEventListener("click", function(e) {
          e.preventDefault();
          if (currentBannerType === 'GDPR') {
            showBanner(consentBanner);
            hideBanner(ccpaBanner);
          } else if (currentBannerType === 'CCPA') {
            showBanner(ccpaBanner);
            hideBanner(consentBanner);
          } else {
            showBanner(consentBanner);
            hideBanner(ccpaBanner);
          }
        });
      }
  
      if (doNotShareLink) {
        doNotShareLink.addEventListener("click", function(e) {
          e.preventDefault();
          hideBanner(ccpaBanner);
          showBanner(mainConsentBanner);
        });
      }
  
      if (closeConsentButton) {
        closeConsentButton.addEventListener("click", function(e) {
          e.preventDefault();
          hideBanner(document.getElementById("main-consent-banner"));
        });
      }
  
      if (acceptButton) {
        acceptButton.addEventListener("click", async function(e) {
          e.preventDefault();
          const preferences = {
            necessary: true,
            marketing: true,
            personalization: true,
            analytics: true
          };
          await updateConsentState(preferences);
          unblockScripts();
          hideBanner(consentBanner);
          hideBanner(mainBanner);
        });
      }
  
      if (declineButton) {
        declineButton.addEventListener("click", async function(e) {
          e.preventDefault();
          const preferences = {
            necessary: true,
            marketing: false,
            personalization: false,
            analytics: false
          };
          await updateConsentState(preferences);
          blockAllScripts();
          hideBanner(consentBanner);
          hideBanner(mainBanner);
        });
      }
  
      if (preferencesButton) {
        preferencesButton.addEventListener("click", function(e) {
          e.preventDefault();
          hideBanner(consentBanner);
          showBanner(mainBanner);
        });
      }
  
      if (savePreferencesButton) {
        savePreferencesButton.addEventListener("click", async function(e) {
          e.preventDefault();
          const preferences = {
            necessary: true,
            marketing: marketingCheckbox?.checked || false,
            personalization: personalizationCheckbox?.checked || false,
            analytics: analyticsCheckbox?.checked || false
          };
          await updateConsentState(preferences);
          hideBanner(consentBanner);
          hideBanner(mainBanner);
        });
      }
  
      if (saveCCPAPreferencesButton) {
        saveCCPAPreferencesButton.addEventListener("click", async function(e) {
          e.preventDefault();
          const doNotShare = doNotShareCheckbox.checked;
          const preferences = {
            necessary: true,
            doNotShare: doNotShare
          };
          await updateConsentState(preferences);
          
          if (doNotShare) {
            blockAllScripts();
          } else {
            unblockScripts();
          }
    
          hideBanner(ccpaBanner);
          hideBanner(mainConsentBanner);
        });
      }
  
      if (cancelButton) {
        cancelButton.addEventListener("click", function(e) {
          e.preventDefault();
          hideBanner(consentBanner);
          hideBanner(mainBanner);
        });
      }
    }
  
    function initializeBanner() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachBannerHandlers);
      } else {
        attachBannerHandlers();
      }
    }
  
    async function initialize() {
      hideBannerclient(document.getElementById("consent-banner"));
      hideBannerclient(document.getElementById("initial-consent-banner"));
      hideBannerclient(document.getElementById("main-banner"));
      hideBannerclient(document.getElementById("main-consent-banner"));
      hideBannerclient(document.getElementById("simple-consent-banner"));
      await loadConsentState();
      await initializeBannerVisibility();
      const hasMainBanners = document.getElementById("consent-banner") || document.getElementById("initial-consent-banner");
  
      if (!hasMainBanners) {
        initializeSimpleBanner();
      } else {
        await initializeBannerVisibility();
      }
    
      attachBannerHandlers();
    }
  
    document.addEventListener('DOMContentLoaded', initialize);
  
    // Set up periodic script checking
    setInterval(revalidateBlockedScripts, 5000);
  })();`;
  