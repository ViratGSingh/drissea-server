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
        const token = await getCSRFToken(csrfToken);
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
            score:scoreInstagramPost(
                requestData.taken_at_timestamp,
                requestData.video_duration,
                requestData.owner.edge_owner_to_timeline_media.count, 
                requestData.owner.edge_followed_by.count, 
                requestData.video_view_count, 
                requestData.video_play_count,
            ),
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
                timestamp:requestData.taken_at_timestamp,
                caption: capt,
            }
        };
    }
    catch (err) {
        throw new Error(`Failed to create output data: ${err.message}`);
    }

    
}


//Function to score video
function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates a score out of 10 for an Instagram post based on various metrics.
 * @param {number} timestamp - The timestamp of the video post in milliseconds since epoch.
 * @param {number} duration - The duration of the video in seconds.
 * @param {number} total_media - The total number of media posts by the user.
 * @param {number} total_followers - The total number of followers of the user.
 * @param {number} views - The number of views the post/video has.
 * @param {number} plays - The number of plays the post/video has.
 * @returns {number} Score between 0 and 10 (rounded to 2 decimals)
 */
 function scoreInstagramPost(timestamp, duration, total_media, total_followers, views, plays) {
    try {
    // Ensure duration is a number and default to 0 if invalid
    duration = Number(duration) || 0;

    const maxVals = {
      maxViews: 50000000,
      maxDuration: 180,
      maxTotalPosts: 1000,
      maxFollowers: 50000000,
      maxAgeHours: 168,
      maxPlays: 50000000
    };

    const now = Date.now();
    const createdAtTime = new Date(timestamp).getTime();
    const ageHours = (now - createdAtTime) / (1000 * 60 * 60);

    // Normalize metrics
    const normAge = clamp(1 - ageHours / maxVals.maxAgeHours); // more recent is better
    const normViews = clamp(views / maxVals.maxViews);
    const normDuration = clamp(duration / maxVals.maxDuration);
    const normPlays = clamp(plays / maxVals.maxPlays);
    const normTotalPosts = clamp(total_media / maxVals.maxTotalPosts);
    const normFollowers = clamp(
      Math.log10(total_followers + 1) / Math.log10(maxVals.maxFollowers + 1)
    );

    // Weights
    const weights = {
      age: 0.25,
      views: 0.20,
      duration: 0.15,
      plays: 0.15,
      totalPosts: 0.10,
      followers: 0.15,
    };

    const score =
      normAge * weights.age +
      normViews * weights.views +
      normDuration * weights.duration +
      normPlays * weights.plays +
      normTotalPosts * weights.totalPosts +
      normFollowers * weights.followers;

    return Math.round(score * 10 * 100) / 100;
  } catch (error) {
    console.error("Error calculating Instagram post score:", error);
    return 0;
  }
}


