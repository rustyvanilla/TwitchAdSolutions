twitch-videoad.js text/javascript
(function() {
    console.log("[VAFT] Script started");
    if ( /(^|\.)twitch\.tv$/.test(document.location.hostname) === false ) { 
        console.log("[VAFT] Not on twitch.tv, exiting"); 
        return; 
    }
    var ourTwitchAdSolutionsVersion = 9;// Used to prevent conflicts with outdated versions of the scripts
    console.log("[VAFT] Our version: " + ourTwitchAdSolutionsVersion);
    if (typeof unsafeWindow === 'undefined') {
        console.log("[VAFT] unsafeWindow not defined, setting to window");
        unsafeWindow = window;
    }
    if (typeof unsafeWindow.twitchAdSolutionsVersion !== 'undefined' && unsafeWindow.twitchAdSolutionsVersion >= ourTwitchAdSolutionsVersion) {
        console.log("[VAFT] skipping vaft as there's another script active. ourVersion:" + ourTwitchAdSolutionsVersion + " activeVersion:" + unsafeWindow.twitchAdSolutionsVersion);
        unsafeWindow.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
        return;
    }
    console.log("[VAFT] Initializing twitchAdSolutionsVersion");
    unsafeWindow.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
    function declareOptions(scope) {
        console.log("[VAFT] Declaring options");
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.ClientVersion = 'null';
        scope.ClientSession = 'null';
        scope.PlayerType2 = 'embed'; //Source
        scope.PlayerType3 = 'site'; //Source
        scope.PlayerType4 = 'autoplay'; //360p
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
        'isVariantA'// TwitchNoSub
    ];
    var workerStringAllow = [];
    var workerStringReinsert = [
        'isVariantA',// TwitchNoSub (prior to (0.9))
        'besuper/',// TwitchNoSub (0.9)
        '${patch_url}'// TwitchNoSub (0.9.1)
    ];
    console.log("[VAFT] Initializing worker strings");
    function getCleanWorker(worker) {
        console.log("[VAFT] Getting clean worker");
        var root = null;
        var parent = null;
        var proto = worker;
        while (proto) {
            var workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                console.log("[VAFT] Found conflict in worker string, cleaning");
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                console.log("[VAFT] Worker string accepted");
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root;
    }
    function getWorkersForReinsert(worker) {
        console.log("[VAFT] Getting workers for reinsert");
        var result = [];
        var proto = worker;
        while (proto) {
            var workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                console.log("[VAFT] Found worker to reinsert");
                result.push(proto);
            } else {
                console.log("[VAFT] Worker not in reinsert list");
            }
            proto = Object.getPrototypeOf(proto);
        }
        return result;
    }
    function reinsertWorkers(worker, reinsert) {
        console.log("[VAFT] Reinserting workers");
        var parent = worker;
        for (var i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }
    function isValidWorker(worker) {
        console.log("[VAFT] Validating worker");
        var workerString = worker.toString();
        return !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
    }
    function hookWindowWorker() {
        console.log("[VAFT] Hooking window worker");
        var reinsert = getWorkersForReinsert(unsafeWindow.Worker);
        console.log("[VAFT] Found " + reinsert.length + " workers to reinsert");
        var newWorker = class Worker extends getCleanWorker(unsafeWindow.Worker) {
            constructor(twitchBlobUrl, options) {
                console.log("[VAFT] Creating new worker for URL: " + twitchBlobUrl);
                var isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv');
                } catch {}
                if (!isTwitchWorker) {
                    console.log("[VAFT] Not a Twitch worker, passing through");
                    super(twitchBlobUrl, options);
                    return;
                }
                console.log("[VAFT] Creating Twitch worker with modified blob");
                var newBlobStr = `
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
                                    reject(new Error(responseData.error));
                                } else {
                                    // Create a Response object from the response data
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
                console.log("[VAFT] Creating blob URL for worker");
                super(URL.createObjectURL(new Blob([newBlobStr])), options);
                twitchWorkers.push(this);
                console.log("[VAFT] Worker created, adding event listeners");
                this.addEventListener('message', (e) => {
                    if (e.data.key == 'ShowAdBlockBanner') {
                        console.log("[VAFT] Show ad block banner message received");
                        if (adBlockDiv == null) {
                            adBlockDiv = getAdBlockDiv();
                        }
                        adBlockDiv.P.textContent = 'Blocking ads';
                        adBlockDiv.style.display = 'block';
                    } else if (e.data.key == 'HideAdBlockBanner') {
                        console.log("[VAFT] Hide ad block banner message received");
                        if (adBlockDiv == null) {
                            adBlockDiv = getAdBlockDiv();
                        }
                        adBlockDiv.style.display = 'none';
                    } else if (e.data.key == 'PauseResumePlayer') {
                        console.log("[VAFT] Pause resume player message received");
                        doTwitchPlayerTask(true, false, false, false, false);
                    } else if (e.data.key == 'ForceChangeQuality') {
                        console.log("[VAFT] Force change quality message received");
                        //This is used to fix the bug where the video would freeze.
                        try {
                            //if (navigator.userAgent.toLowerCase().indexOf('firefox') == -1) {
                                return;
                            //}
                            var autoQuality = doTwitchPlayerTask(false, false, false, true, false);
                            var currentQuality = doTwitchPlayerTask(false, true, false, false, false);
                            if (IsPlayerAutoQuality == null) {
                                IsPlayerAutoQuality = autoQuality;
                            }
                            if (OriginalVideoPlayerQuality == null) {
                                OriginalVideoPlayerQuality = currentQuality;
                            }
                            if (!currentQuality.includes('360') || e.data.value != null) {
                                if (!OriginalVideoPlayerQuality.includes('360')) {
                                    var settingsMenu = document.querySelector('div[data-a-target="player-settings-menu"]');
                                    if (settingsMenu == null) {
                                        var settingsCog = document.querySelector('button[data-a-target="player-settings-button"]');
                                        if (settingsCog) {
                                            console.log("[VAFT] Clicking settings cog");
                                            settingsCog.click();
                                            var qualityMenu = document.querySelector('button[data-a-target="player-settings-menu-item-quality"]');
                                            if (qualityMenu) {
                                                console.log("[VAFT] Clicking quality menu");
                                                qualityMenu.click();
                                            }
                                            var lowQuality = document.querySelectorAll('input[data-a-target="tw-radio"');
                                            if (lowQuality) {
                                                var qualityToSelect = lowQuality.length - 2;
                                                if (e.data.value != null) {
                                                    if (e.data.value.includes('original')) {
                                                        e.data.value = OriginalVideoPlayerQuality;
                                                        if (IsPlayerAutoQuality) {
                                                            e.data.value = 'auto';
                                                        }
                                                    }
                                                    if (e.data.value.includes('160p')) {
                                                        qualityToSelect = 5;
                                                    }
                                                    if (e.data.value.includes('360p')) {
                                                        qualityToSelect = 4;
                                                    }
                                                    if (e.data.value.includes('480p')) {
                                                        qualityToSelect = 3;
                                                    }
                                                    if (e.data.value.includes('720p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('822p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('864p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('900p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('936p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('960p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('1080p')) {
                                                        qualityToSelect = 2;
                                                    }
                                                    if (e.data.value.includes('source')) {
                                                        qualityToSelect = 1;
                                                    }
                                                    if (e.data.value.includes('auto')) {
                                                        qualityToSelect = 0;
                                                    }
                                                }
                                                var currentQualityLS = unsafeWindow.localStorage.getItem('video-quality');
                                                console.log("[VAFT] Selecting quality: " + qualityToSelect);
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
                            console.log("[VAFT] Error in quality change: " + err.message);
                            OriginalVideoPlayerQuality = null;
                            IsPlayerAutoQuality = null;
                        }
                    }
                });
                this.addEventListener('message', async event => {
                    if (event.data.key == 'FetchRequest') {
                        console.log("[VAFT] Fetch request received from worker");
                        const fetchRequest = event.data.value;
                        const responseData = await handleWorkerFetchRequest(fetchRequest);
                        this.postMessage({
                            key: 'FetchResponse',
                            value: responseData
                        });
                    }
                });
                function getAdBlockDiv() {
                    console.log("[VAFT] Creating ad block div");
                    //To display a notification to the user, that an ad is being blocked.
                    var playerRootDiv = document.querySelector('.video-player');
                    var adBlockDiv = null;
                    if (playerRootDiv != null) {
                        adBlockDiv = playerRootDiv.querySelector('.adblock-overlay');
                        if (adBlockDiv == null) {
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
        console.log("[VAFT] Reinserting workers");
        var workerInstance = reinsertWorkers(newWorker, reinsert);
        Object.defineProperty(unsafeWindow, 'Worker', {
            get: function() {
                return workerInstance;
            },
            set: function(value) {
                if (isValidWorker(value)) {
                    console.log("[VAFT] Setting valid worker");
                    workerInstance = value;
                } else {
                    console.log("[VAFT] Attempt to set twitch worker denied");
                }
            }
        });
        console.log("[VAFT] Worker hooking complete");
    }
    function getWasmWorkerJs(twitchBlobUrl) {
        console.log("[VAFT] Getting WASM worker JS for URL: " + twitchBlobUrl);
        var req = new XMLHttpRequest();
        req.open('GET', twitchBlobUrl, false);
        req.overrideMimeType("text/javascript");
        req.send();
        return req.responseText;
    }
    function hookWorkerFetch() {
        console.log("[VAFT] Hooking worker fetch (vaft)");
        var realFetch = fetch;
        fetch = async function(url, options) {
            console.log("[VAFT] Fetch called with URL: " + url);
            if (typeof url === 'string') {
                if (url.endsWith('m3u8')) {
                    console.log("[VAFT] Processing m3u8 file");
                    return new Promise(function(resolve, reject) {
                        var processAfter = async function(response) {
                            if (response.status === 200) {
                                //Here we check the m3u8 for any ads and also try fallback player types if needed.
                                var responseText = await response.text();
                                var weaverText = null;
                                weaverText = await processM3U8(url, responseText, realFetch, PlayerType2);
                                if (weaverText.includes(AdSignifier)) {
                                    console.log("[VAFT] Found ad in first pass, trying second");
                                    weaverText = await processM3U8(url, responseText, realFetch, PlayerType3);
                                }
                                if (weaverText.includes(AdSignifier)) {
                                    console.log("[VAFT] Found ad in second pass, trying third");
                                    weaverText = await processM3U8(url, responseText, realFetch, PlayerType4);
                                }
                                console.log("[VAFT] Final m3u8 processed, resolving");
                                resolve(new Response(weaverText));
                            } else {
                                console.log("[VAFT] Status not 200, returning original response");
                                resolve(response);
                            }
                        };
                        var send = function() {
                            console.log("[VAFT] Sending fetch request");
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                console.log("[VAFT] Fetch error: " + err.message);
                                reject(err);
                            });
                        };
                        send();
                    });
                } else if (url.includes('/api/channel/hls/')) {
                    console.log("[VAFT] Processing channel HLS request");
                    var channelName = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];
                    UsherParams = (new URL(url)).search;
                    CurrentChannelName = channelName;
                    //To prevent pause/resume loop for mid-rolls.
                    var isPBYPRequest = url.includes('picture-by-picture');
                    if (isPBYPRequest) {
                        console.log("[VAFT] PBYP request, setting URL to empty");
                        url = '';
                    }
                    return new Promise(function(resolve, reject) {
                        var processAfter = async function(response) {
                            if (response.status == 200) {
                                encodingsM3u8 = await response.text();
                                var streamInfo = StreamInfos[channelName];
                                if (streamInfo == null) {
                                    StreamInfos[channelName] = streamInfo = {};
                                }
                                streamInfo.ChannelName = channelName;
                                streamInfo.RequestedAds = new Set();
                                streamInfo.Urls = [];// xxx.m3u8 -> { Resolution: "284x160", FrameRate: 30.0 }
                                streamInfo.EncodingsM3U8Cache = [];
                                streamInfo.EncodingsM3U8 = encodingsM3u8;
                                var lines = encodingsM3u8.replace('\r', '').split('\n');
                                for (var i = 0; i < lines.length; i++) {
                                    if (!lines[i].startsWith('#') && lines[i].includes('.m3u8')) {
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
                                            }
                                        }
                                        StreamInfosByUrl[lines[i]] = streamInfo;
                                        MainUrlByUrl[lines[i]] = url;
                                    }
                                }
                                console.log("[VAFT] HLS processed successfully");
                                resolve(new Response(encodingsM3u8));
                            } else {
                                console.log("[VAFT] HLS request failed with status: " + response.status);
                                resolve(response);
                            }
                        };
                        var send = function() {
                            console.log("[VAFT] Sending HLS fetch request");
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                console.log("[VAFT] HLS fetch error: " + err.message);
                                reject(err);
                            });
                        };
                        send();
                    });
                }
            }
            console.log("[VAFT] Passing through original fetch");
            return realFetch.apply(this, arguments);
        };
    }
    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverrideStr) {
        console.log("[VAFT] Getting stream URL for resolution");
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
                                    //console.log(`qualityOverride(A) quality:${quality} frameRate:${frameRate}`);
                                    return matchedResolutionUrl;
                                }
                            } else if (quality < qualityOverride) {
                                //if (matchedResolutionUrl) {
                                //    console.log(`qualityOverride(B) quality:${qualityOverrideFoundQuality} frameRate:${qualityOverrideFoundFrameRate}`);
                                //} else {
                                //    console.log(`qualityOverride(C) quality:${quality} frameRate:${frameRate}`);
                                //}
                                return matchedResolutionUrl ? matchedResolutionUrl : encodingsLines[i];
                            }
                        } else if ((!resolutionInfo || resolution == resolutionInfo.Resolution) &&
                                   (!matchedResolutionUrl || (!matchedFrameRate && frameRate == resolutionInfo.FrameRate))) {
                            matchedResolutionUrl = encodingsLines[i];
                            matchedFrameRate = frameRate == resolutionInfo.FrameRate;
                            if (matchedFrameRate) {
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
        if (qualityOverride) {
            return lastUrl;
        }
        return matchedResolutionUrl ? matchedResolutionUrl : firstUrl;
    }
    async function getStreamForResolution(streamInfo, resolutionInfo, encodingsM3u8, fallbackStreamStr, playerType, realFetch) {
        console.log("[VAFT] Getting stream for resolution: " + resolutionInfo.Resolution);
        var qualityOverride = null;
        if (streamInfo.EncodingsM3U8Cache[playerType].Resolution != resolutionInfo.Resolution ||
            streamInfo.EncodingsM3U8Cache[playerType].RequestTime < Date.now() - EncodingCacheTimeout) {
            console.log("[VAFT] Blocking ads (type:" + playerType + ", resolution:" + resolutionInfo.Resolution + ", frameRate:" + resolutionInfo.FrameRate + ", qualityOverride:" + qualityOverride + ")");
        }
        streamInfo.EncodingsM3U8Cache[playerType].RequestTime = Date.now();
        streamInfo.EncodingsM3U8Cache[playerType].Value = encodingsM3u8;
        streamInfo.EncodingsM3U8Cache[playerType].Resolution = resolutionInfo.Resolution;
        var streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverride);
        var streamM3u8Response = await realFetch(streamM3u8Url);
        if (streamM3u8Response.status == 200) {
            var m3u8Text = await streamM3u8Response.text();
            WasShowingAd = true;
            postMessage({
                key: 'ShowAdBlockBanner'
            });
            postMessage({
                key: 'ForceChangeQuality'
            });
            if (!m3u8Text || m3u8Text.includes(AdSignifier)) {
                streamInfo.EncodingsM3U8Cache[playerType].Value = null;
            }
            console.log("[VAFT] Stream for resolution retrieved");
            return m3u8Text;
        } else {
            streamInfo.EncodingsM3U8Cache[playerType].Value = null;
            console.log("[VAFT] Failed to get stream, returning fallback");
            return fallbackStreamStr;
        }
    }
    function stripUnusedParams(str, params) {
        console.log("[VAFT] Stripping unused parameters");
        if (!params) {
            params = [ 'token', 'sig' ];
        }
        var tempUrl = new URL('https://localhost/' + str);
        for (var i = 0; i < params.length; i++) {
            tempUrl.searchParams.delete(params[i]);
        }
        return tempUrl.pathname.substring(1) + tempUrl.search;
    }
    async function processM3U8(url, textStr, realFetch, playerType) {
        console.log("[VAFT] Processing m3u8 for URL: " + url);
        //Checks the m3u8 for ads and if it finds one, instead returns an ad-free stream.
        var streamInfo = StreamInfosByUrl[url];
        //Ad blocking for squad streams is disabled due to the way multiple weaver urls are used. No workaround so far.
        if (IsSquadStream == true) {
            console.log("[VAFT] Squad stream detected, returning original text");
            return textStr;
        }
        if (!textStr) {
            console.log("[VAFT] Empty text string returned");
            return textStr;
        }
        //Some live streams use mp4.
        if (!textStr.includes('.ts') && !textStr.includes('.mp4')) {
            console.log("[VAFT] Not a ts/mp4 stream, returning original text");
            return textStr;
        }
        var haveAdTags = textStr.includes(AdSignifier);
        if (haveAdTags) {
            console.log("[VAFT] Ad tags found in m3u8");
            var isMidroll = textStr.includes('"MIDROLL"') || textStr.includes('"midroll"');
            //Reduces ad frequency. TODO: Reduce the number of requests. This is really spamming Twitch with requests.
            if (!isMidroll) {
                if (playerType === PlayerType2) {
                    var lines = textStr.replace('\r', '').split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                            if (!line.includes(',live') && !streamInfo.RequestedAds.has(lines[i + 1])) {
                                // Only request one .ts file per .m3u8 request to avoid making too many requests
                                //console.log('Fetch ad .ts file');
                                console.log("[VAFT] Fetching ad .ts file");
                                streamInfo.RequestedAds.add(lines[i + 1]);
                                fetch(lines[i + 1]).then((response)=>{response.blob()});
                                break;
                            }
                        }
                    }
                }
                try {
                    //tryNotifyTwitch(textStr);
                    console.log("[VAFT] Notifying Twitch about ad");
                } catch (err) {
                    console.log("[VAFT] Error in tryNotifyTwitch: " + err.message);
                }
            }
            var currentResolution = null;
            if (streamInfo && streamInfo.Urls) {
                for (const [resUrl, resInfo] of Object.entries(streamInfo.Urls)) {
                    if (resUrl == url) {
                        currentResolution = resInfo;
                        //console.log(resInfo.Resolution);
                        break;
                    }
                }
            }
            // Keep the m3u8 around for a little while (once per ad) before requesting a new one
            var encodingsM3U8Cache = streamInfo.EncodingsM3U8Cache[playerType];
            if (encodingsM3U8Cache) {
                if (encodingsM3U8Cache.Value && encodingsM3U8Cache.RequestTime >= Date.now() - EncodingCacheTimeout) {
                    try {
                        var result = getStreamForResolution(streamInfo, currentResolution, encodingsM3U8Cache.Value, null, playerType, realFetch);
                        if (result) {
                            console.log("[VAFT] Returning cached resolution");
                            return result;
                        }
                    } catch (err) {
                        encodingsM3U8Cache.Value = null;
                    }
                }
            } else {
                streamInfo.EncodingsM3U8Cache[playerType] = {
                    RequestTime: Date.now(),
                    Value: null,
                    Resolution: null
                };
            }
            console.log("[VAFT] Getting access token for channel: " + CurrentChannelName);
            var accessTokenResponse = await getAccessToken(CurrentChannelName, playerType);
            if (accessTokenResponse.status === 200) {
                var accessToken = await accessTokenResponse.json();
                try {
                    var urlInfo = new URL('https://usher.ttvnw.net/api/channel/hls/' + CurrentChannelName + '.m3u8' + UsherParams);
                    urlInfo.searchParams.set('sig', accessToken.data.streamPlaybackAccessToken.signature);
                    urlInfo.searchParams.set('token', accessToken.data.streamPlaybackAccessToken.value);
                    console.log("[VAFT] Fetching encodings m3u8");
                    var encodingsM3u8Response = await realFetch(urlInfo.href);
                    if (encodingsM3u8Response.status === 200) {
                        console.log("[VAFT] Encodings m3u8 fetched successfully");
                        return getStreamForResolution(streamInfo, currentResolution, await encodingsM3u8Response.text(), textStr, playerType, realFetch);
                    } else {
                        console.log("[VAFT] Failed to fetch encodings m3u8, returning original");
                        return textStr;
                    }
                } catch (err) {
                    console.log("[VAFT] Error in encodings m3u8 fetch: " + err.message);
                }
                console.log("[VAFT] Returning original text after error");
                return textStr;
            } else {
                console.log("[VAFT] Failed to get access token, returning original");
                return textStr;
            }
        } else {
            if (WasShowingAd) {
                console.log('[VAFT] Finished blocking ads');
                WasShowingAd = false;
                //Here we put player back to original quality and remove the blocking message.
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
            console.log("[VAFT] No ads found, returning original text");
            return textStr;
        }
        console.log("[VAFT] Returning text at end of processM3U8");
        return textStr;
    }
    function parseAttributes(str) {
        console.log("[VAFT] Parsing attributes");
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
        console.log("[VAFT] Trying to notify Twitch about ad");
        //We notify that an ad was requested but was not visible and was also muted.
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
                console.log("[VAFT] Notifying about ad event");
                await gqlRequest(adRecordgqlPacket('video_ad_impression', radToken, extendedData));
                for (let quartile = 0; quartile < 4; quartile++) {
                    console.log("[VAFT] Notifying about ad quartile");
                    await gqlRequest(
                        adRecordgqlPacket('video_ad_quartile_complete', radToken, {
                            ...extendedData,
                            quartile: quartile + 1,
                        })
                    );
                }
                console.log("[VAFT] Notifying about pod completion");
                await gqlRequest(adRecordgqlPacket('video_ad_pod_complete', radToken, baseData));
            }
        } else {
            console.log("[VAFT] No matching ad found for notification");
        }
    }
    function adRecordgqlPacket(event, radToken, payload) {
        console.log("[VAFT] Creating ad record gql packet");
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
        console.log("[VAFT] Getting access token for channel: " + channelName);
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
        console.log("[VAFT] Access token request created");
        return gqlRequest(body);
    }
    function gqlRequest(body) {
        console.log("[VAFT] Making GQL request");
        if (!GQLDeviceID) {
            var dcharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            var dcharactersLength = dcharacters.length;
            for (var i = 0; i < 32; i++) {
                GQLDeviceID += dcharacters.charAt(Math.floor(Math.random() * dcharactersLength));
            }
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
            console.log("[VAFT] Posting fetch request to worker");
            postMessage({
                key: 'FetchRequest',
                value: fetchRequest
            });
        });
    }
    function doTwitchPlayerTask(isPausePlay, isCheckQuality, isCorrectBuffer, isAutoQuality, setAutoQuality) {
        console.log("[VAFT] Performing Twitch player task");
        //This will do an instant pause/play to return to original quality once the ad is finished.
        //We also use this function to get the current video player quality set by the user.
        //We also use this function to quickly pause/play the player when switching tabs to stop delays.
        try {
            var videoController = null;
            var videoPlayer = null;
            function findReactNode(root, constraint) {
                console.log("[VAFT] Finding React node");
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
                console.log("[VAFT] Finding React root node");
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
            if (isPausePlay) {
                console.log("[VAFT] Pausing and playing player");
                videoPlayer.pause();
                videoPlayer.play();
                return;
            }
            if (isCheckQuality) {
                console.log("[VAFT] Checking player quality");
                if (typeof videoPlayer.getQuality() == 'undefined') {
                    return;
                }
                var playerQuality = JSON.stringify(videoPlayer.getQuality());
                if (playerQuality) {
                    console.log("[VAFT] Player quality: " + playerQuality);
                    return playerQuality;
                } else {
                    return;
                }
            }
            if (isAutoQuality) {
                console.log("[VAFT] Checking auto quality");
                if (typeof videoPlayer.isAutoQualityMode() == 'undefined') {
                    return false;
                }
                var autoQuality = videoPlayer.isAutoQualityMode();
                if (autoQuality) {
                    console.log("[VAFT] Setting auto quality to false");
                    videoPlayer.setAutoQualityMode(false);
                    return autoQuality;
                } else {
                    return false;
                }
            }
            if (setAutoQuality) {
                console.log("[VAFT] Setting auto quality to true");
                videoPlayer.setAutoQualityMode(true);
                return;
            }
            //This only happens when switching tabs and is to correct the high latency caused when opening background tabs and going to them at a later time.
            //We check that this is a live stream by the page URL, to prevent vod/clip pause/plays.
            try {
                var currentPageURL = document.URL;
                var isLive = true;
                if (currentPageURL.includes('videos/') || currentPageURL.includes('clip/')) {
                    isLive = false;
                }
                if (isCorrectBuffer && isLive) {
                    //A timer is needed due to the player not resuming without it.
                    console.log("[VAFT] Correcting buffer, setting timeout");
                    setTimeout(function() {
                        //If latency to broadcaster is above 5 or 15 seconds upon switching tabs, we pause and play the player to reset the latency.
                        //If latency is between 0-6, user can manually pause and resume to reset latency further.
                        if (videoPlayer.isLiveLowLatency() && videoPlayer.getLiveLatency() > 5) {
                            console.log("[VAFT] Latency above 5s, resetting player");
                            videoPlayer.pause();
                            videoPlayer.play();
                        } else if (videoPlayer.getLiveLatency() > 15) {
                            console.log("[VAFT] Latency above 15s, resetting player");
                            videoPlayer.pause();
                            videoPlayer.play();
                        }
                    }, 3000);
                }
            } catch (err) {
                console.log("[VAFT] Error in buffer correction: " + err.message);
            }
        } catch (err) {
            console.log("[VAFT] Error in player task: " + err.message);
        }
    }
    unsafeWindow.reloadTwitchPlayer = doTwitchPlayerTask;
    var localDeviceID = null;
    localDeviceID = unsafeWindow.localStorage.getItem('local_copy_unique_id');
    function postTwitchWorkerMessage(key, value) {
        console.log("[VAFT] Posting message to workers: " + key);
        twitchWorkers.forEach((worker) => {
            worker.postMessage({key: key, value: value});
        });
    }
    function makeGmXmlHttpRequest(fetchRequest) {
        console.log("[VAFT] Making GM XML HTTP request");
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: fetchRequest.options.method,
                url: fetchRequest.url,
                data: fetchRequest.options.body,
                headers: fetchRequest.options.headers,
                onload: response => resolve(response),
                onerror: error => reject(error)
            });
        });
    }
    // Taken from https://github.com/dimdenGD/YeahTwitter/blob/9e0520f5abe029f57929795d8de0d2e5d3751cf3/us.js#L48
    function parseHeaders(headersString) {
        console.log("[VAFT] Parsing headers");
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
        console.log("[VAFT] Handling worker fetch request");
        try {
            if (serverLikesThisBrowser || !serverHatesThisBrowser) {
                console.log("[VAFT] Using realFetch for request");
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
                        console.log("[VAFT] Server hates this browser");
                        serverHatesThisBrowser = true;
                    } else {
                        console.log("[VAFT] Server likes this browser");
                        serverLikesThisBrowser = true;
                    }
                }
                if (serverLikesThisBrowser || !serverHatesThisBrowser) {
                    console.log("[VAFT] Returning response from realFetch");
                    return responseObject;
                }
            }
            if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest !== 'undefined') {
                console.log("[VAFT] Using GM XML HTTP request");
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
                console.log("[VAFT] Returning response from GM request");
                return responseObject;
            }
            throw { message: 'Failed to resolve GQL request. Try the userscript version of the ad blocking solution' };
        } catch (error) {
            console.log("[VAFT] Error in handleWorkerFetchRequest: " + error.message);
            return {
                id: fetchRequest.id,
                error: error.message
            };
        }
    }
    function hookFetch() {
        console.log("[VAFT] Hooking fetch");
        var realFetch = unsafeWindow.fetch;
        unsafeWindow.realFetch = realFetch;
        unsafeWindow.fetch = function(url, init, ...args) {
            console.log("[VAFT] Fetch hook called with URL: " + url);
            if (typeof url === 'string') {
                //Check if squad stream.
                if (unsafeWindow.location.pathname.includes('/squad')) {
                    console.log("[VAFT] Squad stream detected");
                    postTwitchWorkerMessage('UpdateIsSquadStream', true);
                } else {
                    postTwitchWorkerMessage('UpdateIsSquadStream', false);
                }
                if (url.includes('/access_token') || url.includes('gql')) {
                    //Device ID is used when notifying Twitch of ads.
                    var deviceId = init.headers['X-Device-Id'];
                    if (typeof deviceId !== 'string') {
                        deviceId = init.headers['Device-ID'];
                    }
                    //Added to prevent eventual UBlock conflicts.
                    if (typeof deviceId === 'string' && !deviceId.includes('twitch-web-wall-mason')) {
                        console.log("[VAFT] Setting GQL device ID from headers");
                        GQLDeviceID = deviceId;
                    } else if (localDeviceID) {
                        console.log("[VAFT] Setting GQL device ID from localStorage");
                        GQLDeviceID = localDeviceID.replace('"', '');
                        GQLDeviceID = GQLDeviceID.replace('"', '');
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
                    //Client version is used in GQL requests.
                    var clientVersion = init.headers['Client-Version'];
                    if (clientVersion && typeof clientVersion == 'string') {
                        ClientVersion = clientVersion;
                    }
                    if (ClientVersion) {
                        postTwitchWorkerMessage('UpdateClientVersion', ClientVersion);
                    }
                    //Client session is used in GQL requests.
                    var clientSession = init.headers['Client-Session-Id'];
                    if (clientSession && typeof clientSession == 'string') {
                        ClientSession = clientSession;
                    }
                    if (ClientSession) {
                        postTwitchWorkerMessage('UpdateClientSession', ClientSession);
                    }
                    //Client ID is used in GQL requests.
                    if (url.includes('gql') && init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
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
                            postTwitchWorkerMessage('UpdateClientId', ClientID);
                        }
                        //Client integrity header
                        console.log("[VAFT] Setting client integrity header");
                        ClientIntegrityHeader = init.headers['Client-Integrity'];
                        if (ClientIntegrityHeader) {
                            postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader);
                        }
                        //Authorization header
                        console.log("[VAFT] Setting authorization header");
                        AuthorizationHeader = init.headers['Authorization'];
                        if (AuthorizationHeader) {
                            postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader);
                        }
                    }
                    //To prevent pause/resume loop for mid-rolls.
                    if (url.includes('gql') && init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken') && init.body.includes('picture-by-picture')) {
                        console.log("[VAFT] PBYP request, clearing body");
                        init.body = '';
                    }
                    var isPBYPRequest = url.includes('picture-by-picture');
                    if (isPBYPRequest) {
                        console.log("[VAFT] PBYP request, clearing URL");
                        url = '';
                    }
                }
            }
            console.log("[VAFT] Passing through original fetch");
            return realFetch.apply(this, arguments);
        };
    }
    function onContentLoaded() {
        console.log("[VAFT] Content loaded, hooking visibility");
        // This stops Twitch from pausing the player when in another tab and an ad shows.
        // Taken from https://github.com/saucettv/VideoAdBlockForTwitch/blob/cefce9d2b565769c77e3666ac8234c3acfe20d83/chrome/content.js#L30
        try {
            Object.defineProperty(document, 'visibilityState', {
                get() {
                    return 'visible';
                }
            });
        }catch{}
        let hidden = document.__lookupGetter__('hidden');
        let webkitHidden = document.__lookupGetter__('webkitHidden');
        try {
            Object.defineProperty(document, 'hidden', {
                get() {
                    return false;
                }
            });
        }catch{}
        var block = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        let wasVideoPlaying = true;
        var visibilityChange = e => {
            if (typeof chrome !== 'undefined') {
                const videos = document.getElementsByTagName('video');
                if (videos.length > 0) {
                    if (hidden.apply(document) === true || (webkitHidden && webkitHidden.apply(document) === true)) {
                        wasVideoPlaying = !videos[0].paused && !videos[0].ended;
                    } else if (wasVideoPlaying && !videos[0].ended) {
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
        try {
            if (/Firefox/.test(navigator.userAgent)) {
                Object.defineProperty(document, 'mozHidden', {
                    get() {
                        return false;
                    }
                });
            } else {
                Object.defineProperty(document, 'webkitHidden', {
                    get() {
                        return false;
                    }
                });
            }
        }catch{}
        console.log("[VAFT] Visibility hook complete");
    }
    console.log("[VAFT] Declaring options");
    declareOptions(unsafeWindow);
    console.log("[VAFT] Hooking window worker");
    hookWindowWorker();
    console.log("[VAFT] Hooking fetch");
    hookFetch();
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        console.log("[VAFT] Document ready state complete, calling onContentLoaded");
        onContentLoaded();
    } else {
        console.log("[VAFT] Adding DOMContentLoaded event listener");
        unsafeWindow.addEventListener("DOMContentLoaded", function() {
            console.log("[VAFT] DOMContentLoaded fired, calling onContentLoaded");
            onContentLoaded();
        });
    }
    console.log("[VAFT] Script execution complete");
})();
