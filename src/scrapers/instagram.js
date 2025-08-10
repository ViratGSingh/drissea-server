"use strict";
require('dotenv').config();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramGetUrl = instagramGetUrl;
exports.getCSRFToken = getCSRFToken;

const axios_1 = require("axios");
const qs_1 = __importDefault(require("qs"));
const {HttpsProxyAgent} = require('https-proxy-agent');

//Bright Data Access
const proxy_user = process.env.OXY_USERNAME;
const proxy_host = process.env.OXY_HOST;
const proxy_port = parseInt(process.env.OXY_PORT, 10);
const proxy_passwd = process.env.OXY_PASSWORD;

const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);

//Main function
async function instagramGetUrl(url_media, config = { retries: 5, delay: 1000 }, csrfToken = undefined) {
    return new Promise(async (resolve, reject) => {
        try {
            url_media = await checkRedirect(url_media);
            const SHORTCODE = getShortcode(url_media);
            const INSTAGRAM_REQUEST = await instagramRequest(SHORTCODE, config.retries, config.delay, csrfToken);
            const OUTPUT_DATA = createOutputData(INSTAGRAM_REQUEST);
            resolve(OUTPUT_DATA);
        }
        catch (err) {
            reject(err);
        }
    });
}
//Utilities
async function checkRedirect(url) {
    let split_url = url.split("/");
    if (split_url.includes("share")) {
        let res = await axios_1.default.get(url);
        return res.request.path;
    }
    return url;
}
function formatPostInfo(requestData) {
    try {
        let mediaCapt = requestData.edge_media_to_caption.edges;
        const capt = (mediaCapt.length === 0) ? "" : mediaCapt[0].node.text;
        return {
            owner_username: requestData.owner.username,
            owner_fullname: requestData.owner.full_name,
            is_verified: requestData.owner.is_verified,
            is_private: requestData.owner.is_private,
            likes: requestData.edge_media_preview_like.count,
            is_ad: requestData.is_ad,
            caption: capt
        };
    }
    catch (err) {
        throw new Error(`Failed to format post info: ${err.message}`);
    }
}

function formatSourceInfo(requestData) {
    try {
        let mediaCapt = requestData.edge_media_to_caption.edges;
        const capt = (mediaCapt.length === 0) ? "" : mediaCapt[0].node.text;
        return {
            username: requestData.owner.username,
            fullname: requestData.owner.full_name,
            id: requestData.owner.id,
            is_verified: requestData.owner.is_verified,
        };
    }
    catch (err) {
        throw new Error(`Failed to format post info: ${err.message}`);
    }
}
function formatMediaDetails(mediaData) {
    try {
        if (mediaData.is_video) {
            return {
                type: "video",
                dimensions: mediaData.dimensions,
                video_view_count: mediaData.video_view_count,
                url: mediaData.video_url,
                thumbnail: mediaData.display_url
            };
        }
        else {
            return {
                type: "image",
                dimensions: mediaData.dimensions,
                url: mediaData.display_url
            };
        }
    }
    catch (err) {
        throw new Error(`Failed to format media details: ${err.message}`);
    }
}
function getShortcode(url) {
    try {
        let split_url = url.split("/");
        let post_tags = ["p", "reel", "tv", "reels"];
        let index_shortcode = split_url.findIndex(item => post_tags.includes(item)) + 1;
        let shortcode = split_url[index_shortcode];
        return shortcode;
    }
    catch (err) {
        throw new Error(`Failed to obtain shortcode: ${err.message}`);
    }
}
async function getCSRFToken(providedToken) {
    if (providedToken) {
        return providedToken;
    }
    try {
        let config = {
            method: 'GET',
            url: 'https://www.instagram.com/',
            httpsAgent: httpsAgent
        };
        const token = await new Promise((resolve, reject) => {
            axios_1.default.request(config).then((response) => {
                if (!response.headers['set-cookie']) {
                    reject(new Error('CSRF token not found in response headers.'));
                }
                else {
                    const csrfCookie = response.headers['set-cookie'][0];
                    const csrfToken = csrfCookie.split(";")[0].replace("csrftoken=", '');
                    resolve(csrfToken);
                }
            }).catch((err) => {
                reject(err);
            });
        });
        return token;
    }
    catch (err) {
        throw new Error(`Failed to obtain CSRF: ${err.message}`);
    }
}
function isSidecar(requestData) {
    try {
        return requestData["__typename"] == "XDTGraphSidecar";
    }
    catch (err) {
        throw new Error(`Failed sidecar verification: ${err.message}`);
    }
}
async function instagramRequest(shortcode, retries, delay, csrfToken = undefined) {
    var _a;
    try {
        const BASE_URL = "https://www.instagram.com/graphql/query";
        const INSTAGRAM_DOCUMENT_ID = "9510064595728286";
        let dataBody = qs_1.default.stringify({
            'variables': JSON.stringify({
                'shortcode': shortcode,
                'fetch_tagged_user_count': null,
                'hoisted_comment_id': null,
                'hoisted_reply_id': null
            }),
            'doc_id': INSTAGRAM_DOCUMENT_ID
        });
        const token = csrfToken;//await getCSRFToken(csrfToken);
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: BASE_URL,
            headers: {
                'X-CSRFToken': token,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: dataBody,
            httpsAgent: httpsAgent
        };
        const { data } = await axios_1.default.request(config);
        if (!((_a = data.data) === null || _a === void 0 ? void 0 : _a.xdt_shortcode_media))
            throw new Error("Only posts/reels supported, check if your link is valid.");
        return data.data.xdt_shortcode_media;
    }
    catch (err) {
        const errorCodes = [429, 403];
        if (err.response && errorCodes.includes(err.response.status) && retries > 0) {
            const retryAfter = err.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
            await new Promise(res => setTimeout(res, waitTime));
            return instagramRequest(shortcode, retries - 1, delay * 2);
        }
        throw new Error(`Failed instagram request: ${err.message}`);
    }
}
function createOutputData(requestData) {
    try {
        let mediaCapt = requestData.edge_media_to_caption.edges;
        const capt = (mediaCapt.length === 0) ? "" : mediaCapt[0].node.text;
        
    
        return {
            sourceUrl: `https://instagram.com/reel/${requestData.shortcode}`,
            user:{
                username: requestData.owner.username,
                fullname: requestData.owner.full_name,
                id: requestData.owner.id,
                is_verified: requestData.owner.is_verified,
                total_media: requestData.owner.edge_owner_to_timeline_media.count,
                total_followers: requestData.owner.edge_followed_by.count
            },
            video: {
                id: requestData.shortcode,
                duration: requestData.video_duration,
                thumbnail_url: requestData.display_url,
                video_url: requestData.video_url,
                views: requestData.video_view_count,
                plays: requestData.video_play_count,
                caption: capt,
            }
        };
    }
    catch (err) {
        throw new Error(`Failed to create output data: ${err.message}`);
    }
}
