twitch-videoad.js text/javascript
(function() {
    console.log('[VAFT] Script initialization started');
    
    if ( /(^|\.)twitch\.tv$/.test(document.location.hostname) === false ) { 
        console.log('[VAFT] Not on twitch.tv domain, exiting');
        return; 
    }
    
    console.log('[VAFT] Running on twitch.tv domain');
    
    var ourTwitchAdSolutionsVersion = 9;
    console.log('[VAFT] Our version:', ourTwitchAdSolutionsVersion);
    
    if (typeof unsafeWindow === 'undefined') {
        console.log('[VAFT] unsafeWindow not defined, using window');
        unsafeWindow = window;
    }
    
    if (typeof unsafeWindow.twitchAdSolutionsVersion !== 'undefined' && unsafeWindow.twitchAdSolutionsVersion >= ourTwitchAdSolutionsVersion) {
        console.log("[VAFT] Skipping - another script is active. ourVersion:" + ourTwitchAdSolutionsVersion + " activeVersion:" + unsafeWindow.twitchAdSolutionsVersion);
        unsafeWindow.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
        return;
    }
    
    unsafeWindow.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
    console.log('[VAFT] Set active version to:', ourTwitchAdSolutionsVersion);
    
    function declareOptions(scope) {
        console.log('[VAFT] Declaring options on scope');
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.ClientVersion = 'null';
        scope.ClientSession = 'null';
        scope.PlayerType2 = 'embed';
        scope.PlayerType3 = 'site';
        scope.PlayerType4 = 'autoplay';
        scope.CurrentChannelName = null;
        scope.UsherParams = null;
        scope.WasShowingAd = false;
        scope.GQLDeviceID = null;
        scope.IsSquadStream = false;
        scope.StreamInfos = [];
        scope.StreamInfosByUrl = [];
        scope.MainUrlByUrl = [];
        scope.EncodingCacheTimeout = 60000;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = null;
    }
    
    var twitchWorkers = [];
    var adBlockDiv = null;
    var OriginalVideoPlayerQuality = null;
    var IsPlayerAutoQuality = null;
    
    var workerStringConflicts = [
        'twitch',
        'isVariantA'
    ];
    var workerStringAllow = [];
    var workerStringReinsert = [
        'isVariantA',
        'besuper/',
        '${patch_url}'
    ];
    
    function getCleanWorker(worker) {
        console.log('[VAFT] Getting clean worker prototype chain');
        var root = null;
        var parent = null;
        var proto = worker;
        var removedCount = 0;
        
        while (proto) {
            var workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                console.log('[VAFT] Removing conflicting worker prototype');
                removedCount++;
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        
        console.log('[VAFT] Cleaned worker chain, removed', removedCount, 'prototypes');
        return root;
    }
    
    function getWorkersForReinsert(worker) {
        console.log('[VAFT] Getting workers for reinsertion');
        var result = [];
        var proto = worker;
        
        while (proto) {
            var workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                result.push(proto);
                console.log('[VAFT] Found worker for reinsertion');
            }
            proto = Object.getPrototypeOf(proto);
        }
        
        console.log('[VAFT] Found', result.length, 'workers to reinsert');
        return result;
    }
    
    function reinsertWorkers(worker, reinsert) {
        console.log('[VAFT] Reinserting', reinsert.length, 'workers');
        var parent = worker;
        for (var i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }
    
    function isValidWorker(worker) {
        var workerString = worker.toString();
        var isValid = !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
        
        console.log('[VAFT] Worker validation result:', isValid);
        return isValid;
    }
    
    function hookWindowWorker() {
        console.log('[VAFT] Hooking window.Worker');
        
        var reinsert = getWorkersForReinsert(unsafeWindow.Worker);
        var newWorker = class Worker extends getCleanWorker(unsafeWindow.Worker) {
            constructor(twitchBlobUrl, options) {
                console.log('[VAFT] Worker constructor called with URL:', twitchBlobUrl);
                
                var isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv');
                } catch {}
                
                if (!isTwitchWorker) {
                    console.log('[VAFT] Not a Twitch worker, passing through');
                    super(twitchBlobUrl, options);
                    return;
                }
                
                console.log('[VAFT] Intercepting Twitch worker');
                
                var newBlobStr = `
                    console.log('[VAFT-Worker] Worker initialized');
                    const pendingFetchRequests = new Map();
                    ${getStreamUrlForResolution.toString()}
                    ${getStreamForResolution.toString()}
                    ${stripUnusedParams.toString()}
                    ${processM3U8.toString()}
                    ${hookWorkerFetch.toString()}
                    ${declareOptions.toString()}
                    ${getAccessToken.toString()}
                    ${gqlRequest.toString()}
                    ${adRecordgqlPacket.toString()}
                    ${tryNotifyTwitch.toString()}
                    ${parseAttributes.toString()}
                    ${getWasmWorkerJs.toString()}
                    var workerString = getWasmWorkerJs('${twitchBlobUrl.replaceAll("'", "%27")}');
                    declareOptions(self);
                    self.addEventListener('message', function(e) {
                        console.log('[VAFT-Worker] Received message:', e.data.key);
                        if (e.data.key == 'UpdateIsSquadStream') {
                            IsSquadStream = e.data.value;
                        } else if (e.data.key == 'UpdateClientVersion') {
                            ClientVersion = e.data.value;
                        } else if (e.data.key == 'UpdateClientSession') {
                            ClientSession = e.data.value;
                        } else if (e.data.key == 'UpdateClientId') {
                            ClientID = e.data.value;
                        } else if (e.data.key == 'UpdateDeviceId') {
                            GQLDeviceID = e.data.value;
                        } else if (e.data.key == 'UpdateClientIntegrityHeader') {
                            ClientIntegrityHeader = e.data.value;
                        } else if (e.data.key == 'UpdateAuthorizationHeader') {
                            AuthorizationHeader = e.data.value;
                        } else if (e.data.key == 'FetchResponse') {
                            const responseData = e.data.value;
                            if (pendingFetchRequests.has(responseData.id)) {
                                const { resolve, reject } = pendingFetchRequests.get(responseData.id);
                                pendingFetchRequests.delete(responseData.id);
                                if (responseData.error) {
                                    console.log('[VAFT-Worker] Fetch response error:', responseData.error);
                                    reject(new Error(responseData.error));
                                } else {
                                    console.log('[VAFT-Worker] Fetch response success, status:', responseData.status);
                                    const response = new Response(responseData.body, {
                                        status: responseData.status,
                                        statusText: responseData.statusText,
                                        headers: responseData.headers
                                    });
                                    resolve(response);
                                }
                            }
                        }
                    });
                    hookWorkerFetch();
                    eval(workerString);
                `;
                
                super(URL.createObjectURL(new Blob([newBlobStr])), options);
                twitchWorkers.push(this);
                console.log('[VAFT] Added worker to tracking array, total workers:', twitchWorkers.length);
                
                this.addEventListener('message', (e) => {
                    console.log('[VAFT] Message from worker:', e.data.key);
                    
                    if (e.data.key == 'ShowAdBlockBanner') {
                        console.log('[VAFT] Showing ad block banner');
                        if (adBlockDiv == null) {
                            adBlockDiv = getAdBlockDiv();
                        }
                        adBlockDiv.P.textContent = 'Blocking ads';
                        adBlockDiv.style.display = 'block';
                    } else if (e.data.key == 'HideAdBlockBanner') {
                        console.log('[VAFT] Hiding ad block banner');
                        if (adBlockDiv == null) {
                            adBlockDiv = getAdBlockDiv();
                        }
                        adBlockDiv.style.display = 'none';
                    } else if (e.data.key == 'PauseResumePlayer') {
                        console.log('[VAFT] Pause/resume player requested');
                        doTwitchPlayerTask(true, false, false, false, false);
                    } else if (e.data.key == 'ForceChangeQuality') {
                        console.log('[VAFT] Force quality change requested:', e.data.value);
                        try {
                            return;
                            var autoQuality = doTwitchPlayerTask(false, false, false, true, false);
                            var currentQuality = doTwitchPlayerTask(false, true, false, false, false);
                            console.log('[VAFT] Current quality:', currentQuality, 'Auto quality:', autoQuality);
                            
                            if (IsPlayerAutoQuality == null) {
                                IsPlayerAutoQuality = autoQuality;
                            }
                            if (OriginalVideoPlayerQuality == null) {
                                OriginalVideoPlayerQuality = currentQuality;
                            }
                            
                            if (!currentQuality.includes('360') || e.data.value != null) {
                                if (!OriginalVideoPlayerQuality.includes('360')) {
                                    console.log('[VAFT] Attempting quality change');
                                    var settingsMenu = document.querySelector('div[data-a-target="player-settings-menu"]');
                                    if (settingsMenu == null) {
                                        var settingsCog = document.querySelector('button[data-a-target="player-settings-button"]');
                                        if (settingsCog) {
                                            settingsCog.click();
                                            var qualityMenu = document.querySelector('button[data-a-target="player-settings-menu-item-quality"]');
                                            if (qualityMenu) {
                                                qualityMenu.click();
                                            }
                                            var lowQuality = document.querySelectorAll('input[data-a-target="tw-radio"');
                                            if (lowQuality) {
                                                var qualityToSelect = lowQuality.length - 2;
                                                if (e.data.value != null) {
                                                    console.log('[VAFT] Selecting quality:', e.data.value);
                                                    // Quality selection logic...
                                                }
                                                var currentQualityLS = unsafeWindow.localStorage.getItem('video-quality');
                                                lowQuality[qualityToSelect].click();
                                                settingsCog.click();
                                                unsafeWindow.localStorage.setItem('video-quality', currentQualityLS);
                                                if (e.data.value != null) {
                                                    OriginalVideoPlayerQuality = null;
                                                    IsPlayerAutoQuality = null;
                                                    doTwitchPlayerTask(false, false, false, true, true);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('[VAFT] Error changing quality:', err);
                            OriginalVideoPlayerQuality = null;
                            IsPlayerAutoQuality = null;
                        }
                    }
                });
                
                this.addEventListener('message', async event => {
                    if (event.data.key == 'FetchRequest') {
                        console.log('[VAFT] Handling fetch request from worker');
                        const fetchRequest = event.data.value;
                        const responseData = await handleWorkerFetchRequest(fetchRequest);
                        this.postMessage({
                            key: 'FetchResponse',
                            value: responseData
                        });
                    }
                });
                
                function getAdBlockDiv() {
                    console.log('[VAFT] Getting/creating ad block div');
                    var playerRootDiv = document.querySelector('.video-player');
                    var adBlockDiv = null;
                    if (playerRootDiv != null) {
                        adBlockDiv = playerRootDiv.querySelector('.adblock-overlay');
                        if (adBlockDiv == null) {
                            console.log('[VAFT] Creating new ad block overlay');
                            adBlockDiv = document.createElement('div');
                            adBlockDiv.className = 'adblock-overlay';
                            adBlockDiv.innerHTML = '<div class="player-adblock-notice" style="color: white; background-color: rgba(0, 0, 0, 0.8); position: absolute; top: 0px; left: 0px; padding: 5px;"><p></p></div>';
                            adBlockDiv.style.display = 'none';
                            adBlockDiv.P = adBlockDiv.querySelector('p');
                            playerRootDiv.appendChild(adBlockDiv);
                        }
                    }
                    return adBlockDiv;
                }
            }
        };
        
        var workerInstance = reinsertWorkers(newWorker, reinsert);
        
        Object.defineProperty(unsafeWindow, 'Worker', {
            get: function() {
                return workerInstance;
            },
            set: function(value) {
                if (isValidWorker(value)) {
                                        console.log('[VAFT] Setting new valid worker instance');
                    workerInstance = value;
                } else {
                    console.log('[VAFT] Attempt to set invalid twitch worker denied');
                }
            }
        });
        
        console.log('[VAFT] Window.Worker hook complete');
    }
    
    function getWasmWorkerJs(twitchBlobUrl) {
        console.log('[VAFT] Fetching WASM worker JS from:', twitchBlobUrl);
        var req = new XMLHttpRequest();
        req.open('GET', twitchBlobUrl, false);
        req.overrideMimeType("text/javascript");
        req.send();
        console.log('[VAFT] WASM worker JS fetched, length:', req.responseText.length);
        return req.responseText;
    }
    
    function hookWorkerFetch() {
        console.log('[VAFT-Worker] Hooking worker fetch');
        var realFetch = fetch;
        fetch = async function(url, options) {
            if (typeof url === 'string') {
                if (url.endsWith('m3u8')) {
                    console.log('[VAFT-Worker] Intercepting m3u8 request:', url);
                    return new Promise(function(resolve, reject) {
                        var processAfter = async function(response) {
                            if (response.status === 200) {
                                console.log('[VAFT-Worker] Processing m3u8 response');
                                var responseText = await response.text();
                                var weaverText = null;
                                weaverText = await processM3U8(url, responseText, realFetch, PlayerType2);
                                if (weaverText.includes(AdSignifier)) {
                                    console.log('[VAFT-Worker] Ad detected with PlayerType2, trying PlayerType3');
                                    weaverText = await processM3U8(url, responseText, realFetch, PlayerType3);
                                }
                                if (weaverText.includes(AdSignifier)) {
                                    console.log('[VAFT-Worker] Ad detected with PlayerType3, trying PlayerType4');
                                    weaverText = await processM3U8(url, responseText, realFetch, PlayerType4);
                                }
                                resolve(new Response(weaverText));
                            } else {
                                console.log('[VAFT-Worker] m3u8 response not 200:', response.status);
                                resolve(response);
                            }
                        };
                        var send = function() {
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                console.error('[VAFT-Worker] m3u8 fetch error:', err);
                                reject(err);
                            });
                        };
                        send();
                    });
                } else if (url.includes('/api/channel/hls/')) {
                    console.log('[VAFT-Worker] Intercepting HLS API request:', url);
                    var channelName = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];
                    UsherParams = (new URL(url)).search;
                    CurrentChannelName = channelName;
                    console.log('[VAFT-Worker] Channel:', channelName, 'Usher params:', UsherParams);
                    
                    var isPBYPRequest = url.includes('picture-by-picture');
                    if (isPBYPRequest) {
                        console.log('[VAFT-Worker] Picture-by-picture request detected, blocking');
                        url = '';
                    }
                    
                    return new Promise(function(resolve, reject) {
                        var processAfter = async function(response) {
                            if (response.status == 200) {
                                console.log('[VAFT-Worker] Processing HLS response for channel:', channelName);
                                encodingsM3u8 = await response.text();
                                var streamInfo = StreamInfos[channelName];
                                if (streamInfo == null) {
                                    console.log('[VAFT-Worker] Creating new stream info for:', channelName);
                                    StreamInfos[channelName] = streamInfo = {};
                                }
                                streamInfo.ChannelName = channelName;
                                streamInfo.RequestedAds = new Set();
                                streamInfo.Urls = [];
                                streamInfo.EncodingsM3U8Cache = [];
                                streamInfo.EncodingsM3U8 = encodingsM3u8;
                                
                                var lines = encodingsM3u8.replace('\r', '').split('\n');
                                var urlCount = 0;
                                for (var i = 0; i < lines.length; i++) {
                                    if (!lines[i].startsWith('#') && lines[i].includes('.m3u8')) {
                                        urlCount++;
                                        streamInfo.Urls[lines[i]] = -1;
                                        if (i > 0 && lines[i - 1].startsWith('#EXT-X-STREAM-INF')) {
                                            var attributes = parseAttributes(lines[i - 1]);
                                            var resolution = attributes['RESOLUTION'];
                                            var frameRate = attributes['FRAME-RATE'];
                                            if (resolution) {
                                                streamInfo.Urls[lines[i]] = {
                                                    Resolution: resolution,
                                                    FrameRate: frameRate
                                                };
                                                console.log('[VAFT-Worker] Found stream:', resolution, '@', frameRate, 'fps');
                                            }
                                        }
                                        StreamInfosByUrl[lines[i]] = streamInfo;
                                        MainUrlByUrl[lines[i]] = url;
                                    }
                                }
                                console.log('[VAFT-Worker] Found', urlCount, 'stream URLs');
                                resolve(new Response(encodingsM3u8));
                            } else {
                                console.log('[VAFT-Worker] HLS response not 200:', response.status);
                                resolve(response);
                            }
                        };
                        var send = function() {
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                console.error('[VAFT-Worker] HLS fetch error:', err);
                                reject(err);
                            });
                        };
                        send();
                    });
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    
    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverrideStr) {
        console.log('[VAFT-Worker] Getting stream URL for resolution:', resolutionInfo, 'override:', qualityOverrideStr);
        
        var qualityOverride = 0;
        if (qualityOverrideStr && qualityOverrideStr.endsWith('p')) {
            qualityOverride = qualityOverrideStr.substr(0, qualityOverrideStr.length - 1) | 0;
        }
        
        var qualityOverrideFoundQuality = 0;
        var qualityOverrideFoundFrameRate = 0;
        var encodingsLines = encodingsM3u8.replace('\r', '').split('\n');
        var firstUrl = null;
        var lastUrl = null;
        var matchedResolutionUrl = null;
        var matchedFrameRate = false;
        
        for (var i = 0; i < encodingsLines.length; i++) {
            if (!encodingsLines[i].startsWith('#') && encodingsLines[i].includes('.m3u8')) {
                if (i > 0 && encodingsLines[i - 1].startsWith('#EXT-X-STREAM-INF')) {
                    var attributes = parseAttributes(encodingsLines[i - 1]);
                    var resolution = attributes['RESOLUTION'];
                    var frameRate = attributes['FRAME-RATE'];
                    if (resolution) {
                        if (qualityOverride) {
                            var quality = resolution.toLowerCase().split('x')[1];
                            if (quality == qualityOverride) {
                                qualityOverrideFoundQuality = quality;
                                qualityOverrideFoundFrameRate = frameRate;
                                matchedResolutionUrl = encodingsLines[i];
                                if (frameRate < 40) {
                                    console.log('[VAFT-Worker] Found quality override match:', quality, '@', frameRate);
                                    return matchedResolutionUrl;
                                }
                            } else if (quality < qualityOverride) {
                                console.log('[VAFT-Worker] Using lower quality:', quality, 'than requested:', qualityOverride);
                                return matchedResolutionUrl ? matchedResolutionUrl : encodingsLines[i];
                            }
                        } else if ((!resolutionInfo || resolution == resolutionInfo.Resolution) &&
                                   (!matchedResolutionUrl || (!matchedFrameRate && frameRate == resolutionInfo.FrameRate))) {
                            matchedResolutionUrl = encodingsLines[i];
                            matchedFrameRate = frameRate == resolutionInfo.FrameRate;
                            if (matchedFrameRate) {
                                console.log('[VAFT-Worker] Found exact match:', resolution, '@', frameRate);
                                return matchedResolutionUrl;
                            }
                        }
                    }
                    if (firstUrl == null) {
                        firstUrl = encodingsLines[i];
                    }
                    lastUrl = encodingsLines[i];
                }
            }
        }
        
        var result = qualityOverride ? lastUrl : (matchedResolutionUrl ? matchedResolutionUrl : firstUrl);
        console.log('[VAFT-Worker] Selected stream URL:', result);
        return result;
    }
    
    async function getStreamForResolution(streamInfo, resolutionInfo, encodingsM3u8, fallbackStreamStr, playerType, realFetch) {
        var qualityOverride = null;
        if (streamInfo.EncodingsM3U8Cache[playerType].Resolution != resolutionInfo.Resolution ||
            streamInfo.EncodingsM3U8Cache[playerType].RequestTime < Date.now() - EncodingCacheTimeout) {
            console.log(`[VAFT-Worker] Blocking ads (type:${playerType}, resolution:${resolutionInfo.Resolution}, frameRate:${resolutionInfo.FrameRate}, qualityOverride:${qualityOverride})`);
        }
        
        streamInfo.EncodingsM3U8Cache[playerType].RequestTime = Date.now();
        streamInfo.EncodingsM3U8Cache[playerType].Value = encodingsM3u8;
        streamInfo.EncodingsM3U8Cache[playerType].Resolution = resolutionInfo.Resolution;
        
        var streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverride);
        console.log('[VAFT-Worker] Fetching stream m3u8:', streamM3u8Url);
        
        var streamM3u8Response = await realFetch(streamM3u8Url);
        if (streamM3u8Response.status == 200) {
            var m3u8Text = await streamM3u8Response.text();
            WasShowingAd = true;
            console.log('[VAFT-Worker] Got stream m3u8, showing ad block banner');
            
            postMessage({
                key: 'ShowAdBlockBanner'
            });
            postMessage({
                key: 'ForceChangeQuality'
            });
            
            if (!m3u8Text || m3u8Text.includes(AdSignifier)) {
                console.log('[VAFT-Worker] Stream still contains ads, invalidating cache');
                streamInfo.EncodingsM3U8Cache[playerType].Value = null;
            }
            return m3u8Text;
        } else {
            console.log('[VAFT-Worker] Failed to fetch stream m3u8, status:', streamM3u8Response.status);
            streamInfo.EncodingsM3U8Cache[playerType].Value = null;
            return fallbackStreamStr;
        }
    }
    
    function stripUnusedParams(str, params) {
        console.log('[VAFT-Worker] Stripping unused params from:', str);
        if (!params) {
            params = [ 'token', 'sig' ];
        }
        var tempUrl = new URL('https://localhost/' + str);
        for (var i = 0; i < params.length; i++) {
            tempUrl.searchParams.delete(params[i]);
        }
        var result = tempUrl.pathname.substring(1) + tempUrl.search;
        console.log('[VAFT-Worker] Stripped result:', result);
        return result;
    }
    
    async function processM3U8(url, textStr, realFetch, playerType) {
        console.log('[VAFT-Worker] Processing m3u8 for playerType:', playerType);
        
        var streamInfo = StreamInfosByUrl[url];
        
        if (IsSquadStream == true) {
            console.log('[VAFT-Worker] Squad stream detected, skipping ad blocking');
            return textStr;
        }
        
        if (!textStr) {
            console.log('[VAFT-Worker] Empty m3u8 text');
            return textStr;
        }
        
        if (!textStr.includes('.ts') && !textStr.includes('.mp4')) {
            console.log('[VAFT-Worker] No .ts or .mp4 segments found');
            return textStr;
        }
        
        var haveAdTags = textStr.includes(AdSignifier);
        if (haveAdTags) {
            console.log('[VAFT-Worker] Ad tags detected in m3u8');
            var isMidroll = textStr.includes('"MIDROLL"') || textStr.includes('"midroll"');
            console.log('[VAFT-Worker] Is midroll:', isMidroll);
            
            if (!isMidroll) {
                if (playerType === PlayerType2) {
                    var lines = textStr.replace('\r', '').split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                            if (!line.includes(',live') && !streamInfo.RequestedAds.has(lines[i + 1])) {
                                console.log('[VAFT-Worker] Fetching ad .ts file:', lines[i + 1]);
                                streamInfo.RequestedAds.add(lines[i + 1]);
                                fetch(lines[i + 1]).then((response)=>{response.blob()});
                                break;
                            }
                        }
                    }
                }
                try {
                    //tryNotifyTwitch(textStr);
                } catch (err) {
                    console.error('[VAFT-Worker] Error notifying Twitch:', err);
                }
            }
            
            var currentResolution = null;
            if (streamInfo && streamInfo.Urls) {
                for (const [resUrl, resInfo] of Object.entries(streamInfo.Urls)) {
                    if (resUrl == url) {
                        currentResolution = resInfo;
                        console.log('[VAFT-Worker] Current resolution:', resInfo.Resolution);
                        break;
                    }
                }
            }
            
            var encodingsM3U8Cache = streamInfo.EncodingsM3U8Cache[playerType];
            if (encodingsM3U8Cache) {
                if (encodingsM3U8Cache.Value && encodingsM3U8Cache.RequestTime >= Date.now() - EncodingCacheTimeout) {
                                        console.log('[VAFT-Worker] Using cached encodings m3u8');
                    try {
                        var result = getStreamForResolution(streamInfo, currentResolution, encodingsM3U8Cache.Value, null, playerType, realFetch);
                        if (result) {
                            return result;
                        }
                    } catch (err) {
                        console.error('[VAFT-Worker] Error using cached encodings:', err);
                        encodingsM3U8Cache.Value = null;
                    }
                }
            } else {
                console.log('[VAFT-Worker] Creating new encodings cache for playerType:', playerType);
                streamInfo.EncodingsM3U8Cache[playerType] = {
                    RequestTime: Date.now(),
                    Value: null,
                    Resolution: null
                };
            }
            
            console.log('[VAFT-Worker] Fetching new access token for channel:', CurrentChannelName);
            var accessTokenResponse = await getAccessToken(CurrentChannelName, playerType);
            if (accessTokenResponse.status === 200) {
                var accessToken = await accessTokenResponse.json();
                console.log('[VAFT-Worker] Got access token');
                try {
                    var urlInfo = new URL('https://usher.ttvnw.net/api/channel/hls/' + CurrentChannelName + '.m3u8' + UsherParams);
                    urlInfo.searchParams.set('sig', accessToken.data.streamPlaybackAccessToken.signature);
                    urlInfo.searchParams.set('token', accessToken.data.streamPlaybackAccessToken.value);
                    console.log('[VAFT-Worker] Fetching new encodings m3u8');
                    var encodingsM3u8Response = await realFetch(urlInfo.href);
                    if (encodingsM3u8Response.status === 200) {
                        return getStreamForResolution(streamInfo, currentResolution, await encodingsM3u8Response.text(), textStr, playerType, realFetch);
                    } else {
                        console.log('[VAFT-Worker] Failed to fetch encodings m3u8, status:', encodingsM3u8Response.status);
                        return textStr;
                    }
                } catch (err) {
                    console.error('[VAFT-Worker] Error fetching new stream:', err);
                }
                return textStr;
            } else {
                console.log('[VAFT-Worker] Failed to get access token, status:', accessTokenResponse.status);
                return textStr;
            }
        } else {
            if (WasShowingAd) {
                console.log('[VAFT-Worker] Finished blocking ads');
                WasShowingAd = false;
                postMessage({
                    key: 'ForceChangeQuality',
                    value: 'original'
                });
                postMessage({
                    key: 'PauseResumePlayer'
                });
                postMessage({
                    key: 'HideAdBlockBanner'
                });
            }
            return textStr;
        }
        return textStr;
    }
    
    function parseAttributes(str) {
        console.log('[VAFT-Worker] Parsing attributes from:', str);
        return Object.fromEntries(
            str.split(/(?:^|,)((?:[^=]*)=(?:"[^"]*"|[^,]*))/)
            .filter(Boolean)
            .map(x => {
                const idx = x.indexOf('=');
                const key = x.substring(0, idx);
                const value = x.substring(idx + 1);
                const num = Number(value);
                return [key, Number.isNaN(num) ? value.startsWith('"') ? JSON.parse(value) : value : num];
            }));
    }
    
    async function tryNotifyTwitch(streamM3u8) {
        console.log('[VAFT-Worker] Trying to notify Twitch about ad');
        var matches = streamM3u8.match(/#EXT-X-DATERANGE:(ID="stitched-ad-[^\n]+)\n/);
        if (matches.length > 1) {
            const attrString = matches[1];
            const attr = parseAttributes(attrString);
            var podLength = parseInt(attr['X-TV-TWITCH-AD-POD-LENGTH'] ? attr['X-TV-TWITCH-AD-POD-LENGTH'] : '1');
            var podPosition = parseInt(attr['X-TV-TWITCH-AD-POD-POSITION'] ? attr['X-TV-TWITCH-AD-POD-POSITION'] : '0');
            var radToken = attr['X-TV-TWITCH-AD-RADS-TOKEN'];
            var lineItemId = attr['X-TV-TWITCH-AD-LINE-ITEM-ID'];
            var orderId = attr['X-TV-TWITCH-AD-ORDER-ID'];
            var creativeId = attr['X-TV-TWITCH-AD-CREATIVE-ID'];
            var adId = attr['X-TV-TWITCH-AD-ADVERTISER-ID'];
            var rollType = attr['X-TV-TWITCH-AD-ROLL-TYPE'].toLowerCase();
            
            console.log('[VAFT-Worker] Ad info - podLength:', podLength, 'rollType:', rollType);
            
            const baseData = {
                stitched: true,
                roll_type: rollType,
                player_mute: true,
                player_volume: 0.0,
                visible: false,
            };
            
            for (let podPosition = 0; podPosition < podLength; podPosition++) {
                const extendedData = {
                    ...baseData,
                    ad_id: adId,
                    ad_position: podPosition,
                    duration: 0,
                    creative_id: creativeId,
                    total_ads: podLength,
                    order_id: orderId,
                    line_item_id: lineItemId,
                };
                console.log('[VAFT-Worker] Sending ad impression for position:', podPosition);
                await gqlRequest(adRecordgqlPacket('video_ad_impression', radToken, extendedData));
                for (let quartile = 0; quartile < 4; quartile++) {
                    await gqlRequest(
                        adRecordgqlPacket('video_ad_quartile_complete', radToken, {
                            ...extendedData,
                            quartile: quartile + 1,
                        })
                    );
                }
                await gqlRequest(adRecordgqlPacket('video_ad_pod_complete', radToken, baseData));
            }
        }
    }
    
    function adRecordgqlPacket(event, radToken, payload) {
        console.log('[VAFT-Worker] Creating ad record packet for event:', event);
        return [{
            operationName: 'ClientSideAdEventHandling_RecordAdEvent',
            variables: {
                input: {
                    eventName: event,
                    eventPayload: JSON.stringify(payload),
                    radToken,
                },
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: '7e6c69e6eb59f8ccb97ab73686f3d8b7d85a72a0298745ccd8bfc68e4054ca5b',
                },
            },
        }];
    }
    
    function getAccessToken(channelName, playerType) {
        console.log('[VAFT-Worker] Getting access token for channel:', channelName, 'playerType:', playerType);
        var body = null;
        var templateQuery = 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "ios", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "ios", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}';
        body = {
            operationName: 'PlaybackAccessToken_Template',
            query: templateQuery,
            variables: {
                'isLive': true,
                'login': channelName,
                'isVod': false,
                'vodID': '',
                'playerType': playerType
            }
        };
        return gqlRequest(body);
    }
    
    function gqlRequest(body) {
        console.log('[VAFT-Worker] Making GQL request:', body.operationName);
        if (!GQLDeviceID) {
            var dcharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            var dcharactersLength = dcharacters.length;
            for (var i = 0; i < 32; i++) {
                GQLDeviceID += dcharacters.charAt(Math.floor(Math.random() * dcharactersLength));
            }
            console.log('[VAFT-Worker] Generated device ID:', GQLDeviceID);
        }
        var headers = {
            'Client-ID': ClientID,
            'Client-Integrity': ClientIntegrityHeader,
            'Device-ID': GQLDeviceID,
            'X-Device-Id': GQLDeviceID,
            'Client-Version': ClientVersion,
            'Client-Session-Id': ClientSession,
            'Authorization': AuthorizationHeader
        };
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(2, 15);
            const fetchRequest = {
                id: requestId,
                url: 'https://gql.twitch.tv/gql',
                options: {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers
                }
            };
            pendingFetchRequests.set(requestId, {
                resolve,
                reject
            });
            console.log('[VAFT-Worker] Posting fetch request to main thread, id:', requestId);
            postMessage({
                key: 'FetchRequest',
                value: fetchRequest
            });
        });
    }
    
    function doTwitchPlayerTask(isPausePlay, isCheckQuality, isCorrectBuffer, isAutoQuality, setAutoQuality) {
        console.log('[VAFT] doTwitchPlayerTask called - pausePlay:', isPausePlay, 'checkQuality:', isCheckQuality, 
                    'correctBuffer:', isCorrectBuffer, 'autoQuality:', isAutoQuality, 'setAutoQuality:', setAutoQuality);
        try {
            var videoController = null;
            var videoPlayer = null;
            
            function findReactNode(root, constraint) {
                if (root.stateNode && constraint(root.stateNode)) {
                    return root.stateNode;
                }
                let node = root.child;
                while (node) {
                    const result = findReactNode(node, constraint);
                    if (result) {
                        return result;
                    }
                    node = node.sibling;
                }
                return null;
            }
            
            function findReactRootNode() {
                var reactRootNode = null;
                var rootNode = document.querySelector('#root');
                if (rootNode && rootNode._reactRootContainer && rootNode._reactRootContainer._internalRoot && rootNode._reactRootContainer._internalRoot.current) {
                    reactRootNode = rootNode._reactRootContainer._internalRoot.current;
                }
                if (reactRootNode == null) {
                    var containerName = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
                    if (containerName != null) {
                        reactRootNode = rootNode[containerName];
                    }
                }
                return reactRootNode;
            }
            
            var reactRootNode = findReactRootNode();
            if (!reactRootNode) {
                console.log('[VAFT] Could not find react root');
                return;
            }
            
            videoPlayer = findReactNode(reactRootNode, node => node.setPlayerActive && node.props && node.props.mediaPlayerInstance);
            videoPlayer = videoPlayer && videoPlayer.props && videoPlayer.props.mediaPlayerInstance ? videoPlayer.props.mediaPlayerInstance : null;
            
            if (!videoPlayer) {
                console.log('[VAFT] Could not find video player');
                return;
            }
            
            if (isPausePlay) {
                console.log('[VAFT] Pausing and playing video');
                videoPlayer.pause();
                videoPlayer.play();
                return;
            }
            
            if (isCheckQuality) {
                if (typeof videoPlayer.getQuality() == 'undefined') {
                    console.log('[VAFT] getQuality method not available');
                    return;
                }
                var playerQuality = JSON.stringify(videoPlayer.getQuality());
                console.log('[VAFT] Current quality:', playerQuality);
                if (playerQuality) {
                    return playerQuality;
                } else {
                    return;
                }
            }
            
            if (isAutoQuality) {
                if (typeof videoPlayer.isAutoQualityMode() == 'undefined') {
                    console.log('[VAFT] isAutoQualityMode method not available');
                    return false;
                }
                var autoQuality = videoPlayer.isAutoQualityMode();
                console.log('[VAFT] Auto quality mode:', autoQuality);
                if (autoQuality) {
                    videoPlayer.setAutoQualityMode(false);
                    return autoQuality;
                } else {
                    return false;
                }
            }
            
            if (setAutoQuality) {
                console.log('[VAFT] Setting auto quality mode');
                videoPlayer.setAutoQualityMode(true);
                return;
            }
            
            try {
                var currentPageURL = document.URL;
                var isLive = true;
                if (currentPageURL.includes('videos/') || currentPageURL.includes('clip/')) {
                    isLive = false;
                }
                console.log('[VAFT] Is live stream:', isLive);
                
                if (isCorrectBuffer && isLive) {
                    setTimeout(function() {
                        var latency = videoPlayer.getLiveLatency();
                        console.log('[VAFT] Live latency:', latency, 'seconds');
                        if (videoPlayer.isLiveLowLatency() && latency > 5) {
                            console.log('[VAFT] High latency in low latency mode, resetting');
                            videoPlayer.pause();
                            videoPlayer.play();
                        } else if (latency > 15) {
                            console.log('[VAFT] Very high latency, resetting');
                            videoPlayer.pause();
                            videoPlayer.play();
                        }
                    }, 3000);
                }
            } catch (err) {
                console.error('[VAFT] Error in buffer correction:', err);
            }
        } catch (err) {
            console.error('[VAFT] Error in doTwitchPlayerTask:', err);
        }
    }
    
    unsafeWindow.reloadTwitchPlayer = doTwitchPlayerTask;
    
    var localDeviceID = null;
    localDeviceID = unsafeWindow.localStorage.getItem('local_copy_unique_id');
    console.log('[VAFT] Local device ID:', localDeviceID);
    
    function postTwitchWorkerMessage(key, value) {
        console.log('[VAFT] Posting message to', twitchWorkers.length, 'workers - key:', key, 'value:', value);
        twitchWorkers.forEach((worker) => {
            worker.postMessage({key: key, value: value});
        });
    }
    
        function makeGmXmlHttpRequest(fetchRequest) {
        console.log('[VAFT] Making GM XMLHttpRequest to:', fetchRequest.url);
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: fetchRequest.options.method,
                url: fetchRequest.url,
                data: fetchRequest.options.body,
                headers: fetchRequest.options.headers,
                onload: response => {
                    console.log('[VAFT] GM XMLHttpRequest success, status:', response.status);
                    resolve(response);
                },
                onerror: error => {
                    console.error('[VAFT] GM XMLHttpRequest error:', error);
                    reject(error);
                }
            });
        });
    }
    
    function parseHeaders(headersString) {
        console.log('[VAFT] Parsing headers from string');
        const headers = new Headers();
        const lines = headersString.trim().split(/[\r\n]+/);
        lines.forEach(line => {
            const parts = line.split(':');
            const header = parts.shift();
            const value = parts.join(':');
            headers.append(header, value);
        });
        return headers;
    }
    
    var serverLikesThisBrowser = false;
    var serverHatesThisBrowser = false;
    
    async function handleWorkerFetchRequest(fetchRequest) {
        console.log('[VAFT] Handling worker fetch request to:', fetchRequest.url);
        try {
            if (serverLikesThisBrowser || !serverHatesThisBrowser) {
                console.log('[VAFT] Trying native fetch first');
                const response = await unsafeWindow.realFetch(fetchRequest.url, fetchRequest.options);
                const responseBody = await response.text();
                const responseObject = {
                    id: fetchRequest.id,
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: responseBody
                };
                
                if (responseObject.status === 200) {
                    var resp = JSON.parse(responseBody);
                    if (typeof resp.errors !== 'undefined') {
                        console.log('[VAFT] Server returned errors, marking browser as hated');
                        serverHatesThisBrowser = true;
                    } else {
                        console.log('[VAFT] Server response OK, marking browser as liked');
                        serverLikesThisBrowser = true;
                    }
                }
                
                if (serverLikesThisBrowser || !serverHatesThisBrowser) {
                    return responseObject;
                }
            }
            
            if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest !== 'undefined') {
                console.log('[VAFT] Using GM.xmlHttpRequest as fallback');
                fetchRequest.options.headers['Sec-Ch-Ua'] = '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"';
                fetchRequest.options.headers['Referer'] = 'https://www.twitch.tv/';
                fetchRequest.options.headers['Origin'] = 'https://www.twitch.tv/';
                fetchRequest.options.headers['Host'] = 'gql.twitch.tv';
                
                const response = await makeGmXmlHttpRequest(fetchRequest);
                const responseBody = response.responseText;
                const responseObject = {
                    id: fetchRequest.id,
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(parseHeaders(response.responseHeaders).entries()),
                    body: responseBody
                };
                return responseObject;
            }
            
            throw { message: 'Failed to resolve GQL request. Try the userscript version of the ad blocking solution' };
        } catch (error) {
            console.error('[VAFT] Error handling worker fetch request:', error);
            return {
                id: fetchRequest.id,
                error: error.message
            };
        }
    }
    
    function hookFetch() {
        console.log('[VAFT] Hooking main window fetch');
        var realFetch = unsafeWindow.fetch;
        unsafeWindow.realFetch = realFetch;
        unsafeWindow.fetch = function(url, init, ...args) {
            if (typeof url === 'string') {
                if (unsafeWindow.location.pathname.includes('/squad')) {
                    console.log('[VAFT] Squad stream detected');
                    postTwitchWorkerMessage('UpdateIsSquadStream', true);
                } else {
                    postTwitchWorkerMessage('UpdateIsSquadStream', false);
                }
                
                if (url.includes('/access_token') || url.includes('gql')) {
                    console.log('[VAFT] Intercepting token/GQL request:', url);
                    
                    var deviceId = init.headers['X-Device-Id'];
                    if (typeof deviceId !== 'string') {
                        deviceId = init.headers['Device-ID'];
                    }
                    
                    if (typeof deviceId === 'string' && !deviceId.includes('twitch-web-wall-mason')) {
                        GQLDeviceID = deviceId;
                        console.log('[VAFT] Got device ID from headers:', GQLDeviceID);
                    } else if (localDeviceID) {
                        GQLDeviceID = localDeviceID.replace('"', '');
                        GQLDeviceID = GQLDeviceID.replace('"', '');
                        console.log('[VAFT] Using local device ID:', GQLDeviceID);
                    }
                    
                    if (GQLDeviceID) {
                        if (typeof init.headers['X-Device-Id'] === 'string') {
                            init.headers['X-Device-Id'] = GQLDeviceID;
                        }
                        if (typeof init.headers['Device-ID'] === 'string') {
                            init.headers['Device-ID'] = GQLDeviceID;
                        }
                        postTwitchWorkerMessage('UpdateDeviceId', GQLDeviceID);
                    }
                    
                    var clientVersion = init.headers['Client-Version'];
                    if (clientVersion && typeof clientVersion == 'string') {
                        ClientVersion = clientVersion;
                        console.log('[VAFT] Got client version:', ClientVersion);
                    }
                    if (ClientVersion) {
                        postTwitchWorkerMessage('UpdateClientVersion', ClientVersion);
                    }
                    
                    var clientSession = init.headers['Client-Session-Id'];
                    if (clientSession && typeof clientSession == 'string') {
                        ClientSession = clientSession;
                        console.log('[VAFT] Got client session:', ClientSession);
                    }
                    if (ClientSession) {
                        postTwitchWorkerMessage('UpdateClientSession', ClientSession);
                    }
                    
                    if (url.includes('gql') && init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
                        console.log('[VAFT] Intercepting PlaybackAccessToken request');
                        
                        var clientId = init.headers['Client-ID'];
                        if (clientId && typeof clientId == 'string') {
                            ClientID = clientId;
                        } else {
                            clientId = init.headers['Client-Id'];
                            if (clientId && typeof clientId == 'string') {
                                ClientID = clientId;
                            }
                        }
                        if (ClientID) {
                            console.log('[VAFT] Got client ID:', ClientID);
                            postTwitchWorkerMessage('UpdateClientId', ClientID);
                        }
                        
                        ClientIntegrityHeader = init.headers['Client-Integrity'];
                        if (ClientIntegrityHeader) {
                            console.log('[VAFT] Got client integrity header');
                            postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader);
                        }
                        
                        AuthorizationHeader = init.headers['Authorization'];
                        if (AuthorizationHeader) {
                            console.log('[VAFT] Got authorization header');
                            postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader);
                        }
                    }
                    
                    if (url.includes('gql') && init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken') && init.body.includes('picture-by-picture')) {
                        console.log('[VAFT] Blocking picture-by-picture GQL request');
                        init.body = '';
                    }
                    
                    var isPBYPRequest = url.includes('picture-by-picture');
                    if (isPBYPRequest) {
                        console.log('[VAFT] Blocking picture-by-picture URL request');
                        url = '';
                    }
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    
    function onContentLoaded() {
        console.log('[VAFT] DOM content loaded, applying visibility overrides');
        
        try {
            Object.defineProperty(document, 'visibilityState', {
                get() {
                    return 'visible';
                }
            });
            console.log('[VAFT] Overrode document.visibilityState');
        } catch(e) {
            console.error('[VAFT] Failed to override visibilityState:', e);
        }
        
        let hidden = document.__lookupGetter__('hidden');
        let webkitHidden = document.__lookupGetter__('webkitHidden');
        
        try {
            Object.defineProperty(document, 'hidden', {
                get() {
                    return false;
                }
            });
            console.log('[VAFT] Overrode document.hidden');
        } catch(e) {
            console.error('[VAFT] Failed to override hidden:', e);
        }
        
        var block = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        
        let wasVideoPlaying = true;
        var visibilityChange = e => {
            console.log('[VAFT] Visibility change event intercepted');
            if (typeof chrome !== 'undefined') {
                const videos = document.getElementsByTagName('video');
                if (videos.length > 0) {
                    if (hidden.apply(document) === true || (webkitHidden && webkitHidden.apply(document) === true)) {
                        wasVideoPlaying = !videos[0].paused && !videos[0].ended;
                        console.log('[VAFT] Tab hidden, video was playing:', wasVideoPlaying);
                    } else if (wasVideoPlaying && !videos[0].ended) {
                        console.log('[VAFT] Tab visible, resuming video');
                        videos[0].play();
                    }
                }
            }
            block(e);
        };
        
        document.addEventListener('visibilitychange', visibilityChange, true);
        document.addEventListener('webkitvisibilitychange', visibilityChange, true);
        document.addEventListener('mozvisibilitychange', visibilityChange, true);
        document.addEventListener('hasFocus', block, true);
        console.log('[VAFT] Added visibility change listeners');
        
        try {
            if (/Firefox/.test(navigator.userAgent)) {
                Object.defineProperty(document, 'mozHidden', {
                    get() {
                        return false;
                    }
                });
                console.log('[VAFT] Overrode document.mozHidden (Firefox)');
            } else {
                Object.defineProperty(document, 'webkitHidden', {
                    get() {
                        return false;
                    }
                });
                console.log('[VAFT] Overrode document.webkitHidden');
            }
        } catch(e) {
            console.error('[VAFT] Failed to override browser-specific hidden property:', e);
        }
    }
    
    console.log('[VAFT] Initializing main components');
    declareOptions(unsafeWindow);
    hookWindowWorker();
    hookFetch();
    
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        console.log('[VAFT] Document already loaded, running onContentLoaded');
        onContentLoaded();
    } else {
        console.log('[VAFT] Waiting for DOM content to load');
        unsafeWindow.addEventListener("DOMContentLoaded", function() {
            console.log('[VAFT] DOMContentLoaded event fired');
            onContentLoaded();
        });
    }
    
    console.log('[VAFT] Script initialization complete');
})();
